// AI endpoints — the brain of the application.
//
// All three endpoints share a context-building step: given an
// application_id, fetch the founder, their project, the grant + its
// question list, and any memory blocks for that project. That context
// goes into every Claude call.
//
// Endpoints:
//  POST /ai/draft-field      — autofill one question
//  POST /ai/chat             — the apply.html conversation
//  POST /ai/extract-memory   — runs after submission to update memory blocks

import type { FastifyInstance } from 'fastify';
import { requireUser, requireFounder } from '../auth.js';
import { admin } from '../db.js';
import {
  anthropic,
  SYSTEM_PROMPT_DRAFT_FIELD,
  SYSTEM_PROMPT_CHAT,
  SYSTEM_PROMPT_EXTRACT_MEMORY,
} from '../ai.js';
import { config } from '../config.js';
import { draftFieldSchema, chatSchema } from '../schemas/index.js';

// ── Context bundle ──────────────────────────────────────────────────

async function loadContext(applicationId: string, founderId: string) {
  const { data: appli } = await admin
    .from('applications')
    .select('*')
    .eq('id', applicationId)
    .eq('founder_id', founderId)
    .maybeSingle();
  if (!appli) return null;

  const [{ data: founder }, { data: project }, { data: grant }, { data: questions }, { data: memory }, { data: answers }] =
    await Promise.all([
      admin.from('founders').select('*').eq('id', founderId).maybeSingle(),
      admin.from('projects').select('*').eq('id', appli.project_id).maybeSingle(),
      admin.from('grants').select('*, organization:organizations(*)').eq('id', appli.grant_id).maybeSingle(),
      admin.from('grant_questions').select('*').eq('grant_id', appli.grant_id).order('order_index'),
      admin.from('ai_memory_blocks').select('*').eq('project_id', appli.project_id),
      admin.from('application_answers').select('*').eq('application_id', applicationId),
    ]);

  return { appli, founder, project, grant, questions: questions ?? [], memory: memory ?? [], answers: answers ?? [] };
}

function formatContextForPrompt(ctx: Awaited<ReturnType<typeof loadContext>>) {
  if (!ctx) return '';
  const { founder, project, grant, memory, answers } = ctx;
  return `
FOUNDER PROFILE
- Name: ${founder?.full_name ?? ''}
- Age: ${founder?.age ?? ''}
- University / Field: ${founder?.university ?? ''} · ${founder?.field_of_study ?? ''}
- Location: ${founder?.location ?? ''}
- Bio: ${founder?.bio ?? ''}
- Focus areas: ${(founder?.focus_areas ?? []).join(', ')}
- Past experience: ${founder?.past_experience ?? '(not provided)'}

PROJECT
- Title: ${project?.title ?? ''}
- Tagline: ${project?.tagline ?? ''}
- Description: ${project?.description ?? ''}
- Format: ${project?.format ?? ''}
- Stage: ${project?.stage ?? ''}
- Focus areas: ${(project?.focus_areas ?? []).join(', ')}

GRANT
- Title: ${grant?.title ?? ''}
- Organisation: ${(grant as any)?.organization?.name ?? ''}
- Amount: ${grant?.amount_display ?? ''}
- Offering: ${grant?.offering_description ?? ''}
- Eligibility note: ${grant?.eligibility_stage ?? ''}
- Application instructions: ${grant?.application_instructions ?? ''}

MEMORY BLOCKS (from past applications on this project)
${memory.length === 0 ? '(none yet)' : memory.map((m) => `- ${m.block_key}: ${m.content}`).join('\n')}

ALREADY-ANSWERED FIELDS IN THIS APPLICATION
${answers.length === 0 ? '(none yet)' : answers.map((a) => `- ${a.question_key}: ${a.value}`).join('\n')}
`.trim();
}

function formatQuestionForPrompt(q: { question_key: string; label: string; ai_draft_hint?: string | null }) {
  return `Question key: ${q.question_key}\nQuestion: ${q.label}${q.ai_draft_hint ? `\nHint for drafting: ${q.ai_draft_hint}` : ''}`;
}

// ── Routes ──────────────────────────────────────────────────────────

export async function aiRoutes(app: FastifyInstance) {
  // POST /api/v1/ai/draft-field
  app.post('/draft-field', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const parsed = draftFieldSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const { application_id, question_key } = parsed.data;

    const ctx = await loadContext(application_id, req.user!.id);
    if (!ctx) return reply.code(404).send({ error: 'Application not found' });

    const question = ctx.questions.find((q) => q.question_key === question_key);
    if (!question) {
      return reply.code(404).send({ error: 'Question not found for this grant' });
    }

    const userPrompt = `${formatContextForPrompt(ctx)}\n\nTASK\nDraft an answer for this single question, in the founder's voice.\n${formatQuestionForPrompt(question)}\n\nReturn ONLY the drafted answer text — no preamble, no JSON, no markdown.`;

    const resp = await anthropic.messages.create({
      model: config.anthropic.model,
      max_tokens: 800,
      system: SYSTEM_PROMPT_DRAFT_FIELD,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const draft = resp.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('')
      .trim();

    // Pick a sensible source label
    const source =
      ctx.memory.length > 0
        ? 'from your memory + profile'
        : ctx.answers.length > 0
          ? 'from your prior answers'
          : 'from your profile';

    return { draft, source };
  });

  // POST /api/v1/ai/chat — the apply.html conversation
  app.post('/chat', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const { application_id, message_history, user_message } = parsed.data;

    const ctx = await loadContext(application_id, req.user!.id);
    if (!ctx) return reply.code(404).send({ error: 'Application not found' });

    const contextText = formatContextForPrompt(ctx);
    const questionList = ctx.questions
      .map((q, i) => `${i + 1}. [${q.question_key}] ${q.label}`)
      .join('\n');

    const systemPrompt = `${SYSTEM_PROMPT_CHAT}\n\n${contextText}\n\nQUESTIONS THIS GRANT REQUIRES:\n${questionList}`;

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...message_history,
      { role: 'user', content: user_message },
    ];

    const resp = await anthropic.messages.create({
      model: config.anthropic.model,
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    });

    const raw = resp.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('')
      .trim();

    // The system prompt instructs Claude to return JSON. Try to parse;
    // fall back to a plain message if it didn't.
    let parsedResp: {
      ai_message: string;
      quick_replies?: string[];
      fields_filled?: { question_key: string; draft: string; source: string }[];
      step_label?: string;
      generating?: boolean;
    };
    try {
      parsedResp = JSON.parse(raw);
    } catch {
      parsedResp = { ai_message: raw };
    }

    // Side effect: if fields_filled is present, upsert them so the
    // founder sees them populated when they reload.
    if (parsedResp.fields_filled && parsedResp.fields_filled.length > 0) {
      const rows = parsedResp.fields_filled.map((f) => ({
        application_id,
        question_key: f.question_key,
        value: f.draft,
        ai_drafted: true,
        source: f.source,
      }));
      await admin
        .from('application_answers')
        .upsert(rows, { onConflict: 'application_id,question_key' });
    }

    return parsedResp;
  });

  // POST /api/v1/ai/extract-memory — run after a chat completes or app submits
  app.post(
    '/extract-memory',
    { preHandler: [requireUser, requireFounder] },
    async (req, reply) => {
      const { application_id } = (req.body ?? {}) as { application_id?: string };
      if (!application_id) return reply.code(400).send({ error: 'application_id required' });

      const ctx = await loadContext(application_id, req.user!.id);
      if (!ctx) return reply.code(404).send({ error: 'Application not found' });

      const sourceText = `
PROJECT: ${ctx.project?.title ?? ''}

ANSWERS GIVEN IN THIS APPLICATION:
${ctx.answers.map((a) => `[${a.question_key}] ${a.value}`).join('\n\n')}

FOUNDER PROFILE:
- Bio: ${ctx.founder?.bio ?? ''}
- Past experience: ${ctx.founder?.past_experience ?? ''}
`.trim();

      const resp = await anthropic.messages.create({
        model: config.anthropic.model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT_EXTRACT_MEMORY,
        messages: [{ role: 'user', content: sourceText }],
      });

      const raw = resp.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('')
        .trim();

      let blocks: Record<string, string>;
      try {
        blocks = JSON.parse(raw);
      } catch {
        return reply.code(502).send({ error: 'AI returned non-JSON memory blocks', raw });
      }

      const projectId = ctx.appli.project_id;
      const upserts = Object.entries(blocks)
        .filter(([, content]) => typeof content === 'string' && content.trim() !== '')
        .map(([key, content]) => ({
          project_id: projectId,
          block_key: key,
          content,
          source: `application:${application_id}`,
        }));

      if (upserts.length > 0) {
        const { error } = await admin
          .from('ai_memory_blocks')
          .upsert(upserts, { onConflict: 'project_id,block_key' });
        if (error) return reply.code(500).send({ error: error.message });
      }

      return { ok: true, blocks_updated: upserts.length };
    },
  );
}
