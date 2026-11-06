import { z } from 'zod';
import { LayoutSchema } from './layout';

const TrackerKey = z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'clé en majuscules, 2 à 10 caractères');
const Role = z.string().max(60);

/** Un tracker d'un template : même forme qu'un tracker, sans le projet. */
export const TemplateTrackerSchema = z.object({
  layout: LayoutSchema.nullish(),
  /** Type de tracker d'organisation (T-0097). */
  typeKey: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/).nullish(),
  key: TrackerKey,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  fields: z.array(z.object({
    key: z.string().min(1).max(60), label: z.string().min(1).max(100), type: z.string(),
    config: z.record(z.string(), z.unknown()).optional(), required: z.boolean().optional(),
    semanticRole: z.enum(['title', 'description', 'status', 'assignee', 'due_date', 'estimate']).optional(), isContent: z.boolean().optional(),
    readRoles: z.array(Role).max(20).optional(), writeRoles: z.array(Role).max(20).optional(),
  })).max(100),
  statuses: z.array(z.object({ key: z.string().min(1), name: z.string().min(1), category: z.enum(['todo', 'in_progress', 'done']) })).min(1).max(50),
  transitions: z.array(z.object({
    name: z.string().min(1), from: z.string().nullable(), to: z.string(),
    conditions: z.array(z.unknown()).optional(), validators: z.array(z.unknown()).optional(), postActions: z.array(z.unknown()).optional(),
  })).max(200),
});
export type TemplateTracker = z.infer<typeof TemplateTrackerSchema>;


