import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { useChangeAdminPassword } from "../hooks/use-auth.ts";

/** Adds validation errors for password confirmation and password reuse. */
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

const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z
      .string()
      .min(15, "New password must contain at least 15 characters.")
      .max(128, "New password must be 128 characters or fewer."),
    confirmPassword: z.string().min(1, "Password confirmation is required."),
  })
  .superRefine(validatePasswordChange);

type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

/** Renders the password-change form and shows validation beside each field. */
export function ChangePasswordForm(): React.JSX.Element {
  const changePassword = useChangeAdminPassword();
  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  /** Sends valid password fields to the API. */
  function handleSubmit(values: ChangePasswordFormValues): void {
    changePassword.mutate(values);
  }

  const apiError =
    changePassword.error instanceof ApiError ? changePassword.error : null;

  return (
    <form className="auth-form password-form" onSubmit={form.handleSubmit(handleSubmit)}>
      <label className="ui-field" htmlFor="currentPassword">
        <span>Current password</span>
        <input
          autoComplete="current-password"
          id="currentPassword"
          type="password"
          {...form.register("currentPassword")}
        />
        {form.formState.errors.currentPassword ? (
          <span className="error-message">
            {form.formState.errors.currentPassword.message}
          </span>
        ) : null}
      </label>

      <label className="ui-field" htmlFor="newPassword">
        <span>New password</span>
        <input
          autoComplete="new-password"
          id="newPassword"
          type="password"
          {...form.register("newPassword")}
        />
        {form.formState.errors.newPassword ? (
          <span className="error-message">
            {form.formState.errors.newPassword.message}
          </span>
        ) : null}
      </label>

      <label className="ui-field" htmlFor="confirmPassword">
        <span>Confirm new password</span>
        <input
          autoComplete="new-password"
          id="confirmPassword"
          type="password"
          {...form.register("confirmPassword")}
        />
        {form.formState.errors.confirmPassword ? (
          <span className="error-message">
            {form.formState.errors.confirmPassword.message}
          </span>
        ) : null}
      </label>

      {apiError ? <p className="error-message">{apiError.message}</p> : null}

      <Button
        disabled={changePassword.isPending}
        label={changePassword.isPending ? "Changing password..." : "Change password"}
        type="submit"
      />
    </form>
  );
}
