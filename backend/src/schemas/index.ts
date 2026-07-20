// Zod input validation schemas — one per write endpoint.
// Route handlers parse `request.body` through these so bad inputs
// never reach the database.

import { z } from 'zod';

// ── Profile / Founder ────────────────────────────────────────────────

export const createProfileSchema = z.object({
  role: z.enum(['founder', 'backer']),
  // For founders:
  founder: z
    .object({
      full_name: z.string().min(2).max(100),
      age: z.number().int().min(13).max(99),
      university: z.string().max(200).optional(),
      field_of_study: z.string().max(200).optional(),
      location: z.string().max(200).optional(),
      contact_email: z.string().email().max(200),
      contact_phone: z.string().min(8).max(30),
    })
    .optional(),
  // For backers:
  organization: z
    .object({
      name: z.string().min(2).max(200),
      type: z.enum([
        'community',
        'government',
        'corporate',
        'foundation',
        'accelerator',
        'other',
      ]),
      location: z.string().max(200).optional(),
      contact_name: z.string().min(2).max(100),
      contact_email: z.string().email().max(200),
      contact_phone: z.string().min(8).max(30),
    })
    .optional(),
});

export const updateFounderSchema = z.object({
  full_name: z.string().min(2).max(100).optional(),
  age: z.number().int().min(13).max(99).optional(),
  university: z.string().max(200).optional(),
  field_of_study: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  bio: z.string().max(2000).optional(),
  focus_areas: z.array(z.string().max(50)).max(20).optional(),
  profile_photo_url: z.string().url().optional(),
  linkedin_url: z.string().url().optional(),
  past_experience: z.string().max(2000).optional(),
  community: z.string().max(1000).optional(),
  typical_budget: z.string().max(200).optional(),
  contact_email: z.string().email().max(200).optional(),
  contact_phone: z.string().min(8).max(30).optional(),
  open_to_backers: z.boolean().optional(),
  seeking_grant_match: z.boolean().optional(),
});

// ── Projects ─────────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  title: z.string().min(2).max(200),
  tagline: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  format: z.enum(['solo', 'team', 'social_enterprise', 'startup']).optional(),
  stage: z.enum(['idea', 'planning', 'building', 'has_users']).optional(),
  focus_areas: z.array(z.string().max(50)).max(20).optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

// ── Grants ───────────────────────────────────────────────────────────

export const createGrantSchema = z.object({
  title: z.string().min(2).max(200),
  reference_code: z.string().max(50).optional(),
  grant_type: z.enum([
    'cash',
    'mentorship',
    'incubation',
    'mixed',
    'resource',
    'scholarship',
  ]),
  amount_display: z.string().max(200),
  amount_min: z.number().int().nonnegative().optional(),
  amount_max: z.number().int().nonnegative().optional(),
  value_description: z.string().max(2000).optional(),
  difficulty: z.enum(['easy', 'moderate', 'selective']).optional(),
  focus_areas: z.array(z.string().max(50)).max(20).optional(),
  application_opens_at: z.string().optional(), // ISO date
  application_closes_at: z.string().optional(),
  is_rolling: z.boolean().optional(),
  frequency: z.string().max(100).optional(),
  eligibility_age_min: z.number().int().min(0).max(99).optional(),
  eligibility_age_max: z.number().int().min(0).max(99).optional(),
  eligibility_stage: z.string().max(200).optional(),
  eligibility_citizenship: z.string().max(200).optional(),
  eligibility_team_solo: z.string().max(200).optional(),
  eligibility_exclusions: z.string().max(500).optional(),
  offering_description: z.string().max(2000),
  expectations: z.string().max(1000).optional(),
  engagement_style: z.string().max(200).optional(),
  response_time: z.string().max(100).optional(),
  application_instructions: z.string().max(2000),
  has_pitch_round: z.boolean().optional(),
  pitch_format: z.string().max(200).optional(),
  pitch_prep: z.string().max(500).optional(),
  decision_timeline: z.string().max(200).optional(),
  notification_method: z.string().max(200).optional(),
  questions: z
    .array(
      z.object({
        question_key: z.string().min(1).max(50),
        label: z.string().min(1).max(300),
        placeholder: z.string().max(300).optional(),
        help_text: z.string().max(500).optional(),
        field_type: z
          .enum(['short_text', 'long_text', 'number', 'select', 'file'])
          .default('long_text'),
        options: z.unknown().optional(),
        required: z.boolean().default(true),
        order_index: z.number().int().default(0),
        ai_draft_hint: z.string().max(1000).optional(),
      }),
    )
    .optional(),
});

// ── Applications ─────────────────────────────────────────────────────

export const createApplicationSchema = z.object({
  project_id: z.string().uuid(),
  grant_id: z.string().uuid(),
});

export const upsertAnswersSchema = z.object({
  answers: z.array(
    z.object({
      question_key: z.string().min(1).max(50),
      value: z.string().max(10000),
      ai_drafted: z.boolean().default(false),
      source: z.string().max(100).optional(),
    }),
  ),
});

export const submitExternalSchema = z.object({
  method: z.enum(['email_sent', 'manual_copy', 'portal_redirect']),
});

// ── Backer actions ───────────────────────────────────────────────────

export const updateApplicationStatusSchema = z.object({
  status: z.enum([
    'in_review',
    'shortlisted',
    'backed',
    'rejected',
  ]),
});

export const contactRequestSchema = z.object({
  preferred_time: z.string().max(200),
  format: z.string().max(100),
  message: z.string().max(2000).optional(),
});

// ── AI ───────────────────────────────────────────────────────────────

export const draftFieldSchema = z.object({
  application_id: z.string().uuid(),
  question_key: z.string().min(1).max(50),
});

export const chatSchema = z.object({
  application_id: z.string().uuid(),
  message_history: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(5000),
    }),
  ),
  user_message: z.string().max(5000),
});
