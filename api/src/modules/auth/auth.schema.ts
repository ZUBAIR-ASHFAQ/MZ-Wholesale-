import { z } from "zod";

/** Validates and normalizes the administrator email used during login. */
const loginEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email must be 254 characters or fewer.")
  .email("Email is invalid.");

/** Validates an existing password without trimming or changing its characters. */
const existingPasswordSchema = z
  .string()
  .min(1, "Password is required.")
  .max(128, "Password must be 128 characters or fewer.");

/** Validates a new password while preserving spaces and Unicode characters. */
const newPasswordSchema = z
  .string()
  .min(15, "New password must contain at least 15 characters.")
  .max(128, "New password must be 128 characters or fewer.");

/** Validates and trims the administrator name used during bootstrap. */
const bootstrapAdminNameSchema = z
  .string()
  .trim()
  .min(1, "Administrator name is required.")
  .max(160, "Administrator name must be 160 characters or fewer.");

/** Validates a strict login body and rejects unknown or server-managed fields. */
export const loginRequestSchema = z
  .object({
    email: loginEmailSchema,
    password: existingPasswordSchema,
  })
  .strict();

/** Adds readable field errors for password confirmation and password reuse. */
function validatePasswordChange(
  input: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  },
  context: z.RefinementCtx,
): void {
  if (input.newPassword !== input.confirmPassword) {
    context.addIssue({
      code: "custom",
      path: ["confirmPassword"],
      message: "Password confirmation must match the new password.",
    });
  }

  if (input.newPassword === input.currentPassword) {
    context.addIssue({
      code: "custom",
      path: ["newPassword"],
      message: "New password must differ from the current password.",
    });
  }
}

/** Validates password-change fields and the relationships between their values. */
export const changePasswordRequestSchema = z
  .object({
    currentPassword: existingPasswordSchema,
    newPassword: newPasswordSchema,
    confirmPassword: newPasswordSchema,
  })
  .strict()
  .superRefine(validatePasswordChange);

/** Validates the three deployment values used to create the first admin. */
export const bootstrapAdminSchema = z
  .object({
    name: bootstrapAdminNameSchema,
    email: loginEmailSchema,
    password: newPasswordSchema,
  })
  .strict();

/** Accepts only an absent request body for refresh. */
export const refreshRequestBodySchema = z.undefined();

/** Accepts only an absent request body for logout. */
export const logoutRequestBodySchema = z.undefined();

/** Rejects every query parameter because the current-admin route has no filters. */
export const currentAdminQuerySchema = z.object({}).strict();


/** Rejects every query parameter because the session list has no filters. */
export const adminSessionsQuerySchema = z.object({}).strict();

/** Validates the UUID path parameter used to revoke one active session. */
export const adminSessionIdParamsSchema = z
  .object({
    id: z.string().uuid("Session ID must be a valid UUID."),
  })
  .strict();

/** Accepts only an absent request body for logout-all. */
export const logoutAllRequestBodySchema = z.undefined();

/** Contains the public login fields after validation and normalization. */
export type LoginInput = z.infer<typeof loginRequestSchema>;

/** Contains the three password fields accepted by password change. */
export type ChangePasswordInput = z.infer<typeof changePasswordRequestSchema>;

/** Contains the deployment-only initial administrator values. */
export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;
