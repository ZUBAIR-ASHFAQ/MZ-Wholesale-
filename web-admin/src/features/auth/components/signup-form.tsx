import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import { useSignupAdmin } from "../hooks/use-auth.ts";

/** Validates account creation before sending the request to the API. */
const signupFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required.")
      .max(160, "Name must be 160 characters or fewer."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, "Email must be 254 characters or fewer.")
      .email("Email is invalid."),
    password: z
      .string()
      .min(15, "Password must contain at least 15 characters.")
      .max(128, "Password must be 128 characters or fewer."),
    confirmPassword: z
      .string()
      .min(1, "Password confirmation is required.")
      .max(128, "Password confirmation must be 128 characters or fewer."),
  })
  .superRefine((input, context) => {
    if (input.password !== input.confirmPassword) {
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Password confirmation must match the password.",
      });
    }
  });

type SignupFormValues = z.infer<typeof signupFormSchema>;

/** Renders the account-creation form used by each independent administrator. */
export function SignupForm(): React.JSX.Element {
  const signup = useSignupAdmin();
  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  /** Sends only locally valid account fields to the API. */
  function handleSubmit(values: SignupFormValues): void {
    signup.mutate(values);
  }

  const apiError = signup.error instanceof ApiError ? signup.error : null;

  /** Returns a server validation message for one signup field, when present. */
  function apiFieldError(field: keyof SignupFormValues): string | undefined {
    return apiError?.fieldErrors.find((error) => error.field === field)?.message;
  }

  const nameError = form.formState.errors.name?.message ?? apiFieldError("name");
  const emailError = form.formState.errors.email?.message ?? apiFieldError("email");
  const passwordError =
    form.formState.errors.password?.message ?? apiFieldError("password");
  const confirmPasswordError =
    form.formState.errors.confirmPassword?.message ??
    apiFieldError("confirmPassword");

  return (
    <form
      className="auth-form signup-form"
      noValidate
      onSubmit={form.handleSubmit(handleSubmit)}
    >
      <label className="ui-field" htmlFor="signup-name">
        <span>Name</span>
        <input
          autoComplete="name"
          id="signup-name"
          type="text"
          {...form.register("name")}
        />
        {nameError ? <small className="error-message">{nameError}</small> : null}
      </label>

      <label className="ui-field" htmlFor="signup-email">
        <span>Email</span>
        <input
          autoComplete="username"
          id="signup-email"
          type="email"
          {...form.register("email")}
        />
        {emailError ? <small className="error-message">{emailError}</small> : null}
      </label>

      <label className="ui-field" htmlFor="signup-password">
        <span>Password</span>
        <input
          autoComplete="new-password"
          id="signup-password"
          minLength={15}
          type="password"
          {...form.register("password")}
        />
        <small className="field-help">Use at least 15 characters.</small>
        {passwordError ? (
          <small className="error-message">{passwordError}</small>
        ) : null}
      </label>

      <label className="ui-field" htmlFor="signup-confirm-password">
        <span>Confirm password</span>
        <input
          autoComplete="new-password"
          id="signup-confirm-password"
          type="password"
          {...form.register("confirmPassword")}
        />
        {confirmPasswordError ? (
          <small className="error-message">{confirmPasswordError}</small>
        ) : null}
      </label>

      {apiError && apiError.fieldErrors.length === 0 ? (
        <p className="error-message signup-form-error">{apiError.message}</p>
      ) : null}

      <Button
        disabled={signup.isPending}
        label={signup.isPending ? "Creating account..." : "Create account"}
        type="submit"
      />
    </form>
  );
}
