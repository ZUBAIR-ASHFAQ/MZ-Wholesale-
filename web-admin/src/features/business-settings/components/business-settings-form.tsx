import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../../components/ui/button.tsx";
import { ApiError } from "../../../lib/api-types.ts";
import {
  DOCUMENT_TYPES,
  type BusinessSettingsData,
  type DocumentSequenceInput,
  type DocumentType,
  type SaveBusinessSettingsInput,
} from "../api/business-settings.api.ts";
import { useSaveBusinessSettings } from "../hooks/use-business-settings.ts";

const prefixSchema = z
  .string()
  .trim()
  .min(1, "Prefix is required.")
  .max(20, "Prefix must be 20 characters or fewer.")
  .regex(
    /^[A-Z0-9-]+$/,
    "Use uppercase letters, numbers, and hyphens only.",
  );

const formSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, "Business name is required.")
    .max(160, "Business name must be 160 characters or fewer."),
  phone: z
    .string()
    .trim()
    .min(7, "Phone must contain at least 7 characters.")
    .max(32, "Phone must be 32 characters or fewer.")
    .regex(/^[0-9+() -]+$/, "Phone contains unsupported characters."),
  email: z
    .string()
    .trim()
    .max(254, "Email must be 254 characters or fewer.")
    .refine(
      (value) => value.length === 0 || z.email().safeParse(value).success,
      "Email is invalid.",
    ),
  address: z
    .string()
    .trim()
    .min(1, "Address is required.")
    .max(1000, "Address must be 1000 characters or fewer."),
  logoUrl: z
    .string()
    .trim()
    .max(2048, "Logo URL must be 2048 characters or fewer.")
    .refine(
      (value) => value.length === 0 || z.url().safeParse(value).success,
      "Logo URL is invalid.",
    ),
  sequences: z
    .array(
      z.object({
        documentType: z.enum(DOCUMENT_TYPES),
        prefix: prefixSchema,
        nextNumber: z
          .number()
          .int("Next number must be a whole number.")
          .positive("Next number must be greater than zero."),
      }),
    )
    .length(7, "All seven document sequences are required."),
});

type BusinessSettingsFormValues = z.infer<typeof formSchema>;

interface BusinessSettingsFormProps {
  data: BusinessSettingsData;
}

/** Returns null for an optional text value when the field is blank. */
function optionalText(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

/** Finds one saved sequence or creates its safe first-time default. */
function createSequenceValue(
  data: BusinessSettingsData,
  documentType: DocumentType,
): DocumentSequenceInput {
  const savedSequence = data.sequences.find(
    (sequence) => sequence.documentType === documentType,
  );

  if (savedSequence) {
    return {
      documentType,
      prefix: savedSequence.prefix,
      nextNumber: savedSequence.nextNumber,
    };
  }

  return {
    documentType,
    prefix: documentType.replaceAll("_", "-"),
    nextNumber: 1,
  };
}

/** Creates the initial form values from the latest API response. */
function createDefaultValues(
  data: BusinessSettingsData,
): BusinessSettingsFormValues {
  const sequences: DocumentSequenceInput[] = [];

  for (const documentType of DOCUMENT_TYPES) {
    sequences.push(createSequenceValue(data, documentType));
  }

  return {
    businessName: data.settings?.businessName ?? "",
    phone: data.settings?.phone ?? "",
    email: data.settings?.email ?? "",
    address: data.settings?.address ?? "",
    logoUrl: data.settings?.logoUrl ?? "",
    sequences,
  };
}

/** Converts validated form values to the backend settings contract. */
function createSaveInput(
  values: BusinessSettingsFormValues,
  isConfigured: boolean,
): SaveBusinessSettingsInput {
  const sharedFields = {
    businessName: values.businessName.trim(),
    phone: values.phone.trim(),
    email: optionalText(values.email),
    address: values.address.trim(),
    logoUrl: optionalText(values.logoUrl),
    sequences: values.sequences,
  };

  if (isConfigured) {
    return sharedFields;
  }

  return {
    ...sharedFields,
    currency: "PKR",
    timezone: "Asia/Karachi",
  };
}

/** Converts a backend field path to a form field path when possible. */
function normalizeFieldPath(field: string): keyof BusinessSettingsFormValues | string {
  if (field.startsWith("body.")) {
    return field.slice(5);
  }

  return field;
}

/** Displays one document type in a readable label. */
function formatDocumentType(documentType: DocumentType): string {
  return documentType
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Renders the complete first-time setup and later update form. */
export function BusinessSettingsForm({
  data,
}: BusinessSettingsFormProps): React.JSX.Element {
  const saveMutation = useSaveBusinessSettings();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<BusinessSettingsFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: createDefaultValues(data),
  });

  /** Saves valid form values and maps API field errors back to the form. */
  async function submitForm(values: BusinessSettingsFormValues): Promise<void> {
    try {
      await saveMutation.mutateAsync(createSaveInput(values, data.isConfigured));
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setError("root", { message: "Business settings could not be saved." });
        return;
      }

      setError("root", { message: error.message });

      for (const fieldError of error.fieldErrors) {
        setError(normalizeFieldPath(fieldError.field) as never, {
          message: fieldError.message,
        });
      }
    }
  }

  return (
    <form className="settings-form" onSubmit={handleSubmit(submitForm)}>
      <section className="management-card">
        <div>
          <p className="eyebrow">Business identity</p>
          <h2>{data.isConfigured ? "Update setup" : "Complete setup"}</h2>
        </div>

        {errors.root?.message ? (
          <p className="error-message form-message">{errors.root.message}</p>
        ) : null}

        {saveMutation.isSuccess ? (
          <p className="success-message form-message">
            Business settings saved successfully.
          </p>
        ) : null}

        <div className="settings-form-grid">
          <label className="ui-field" htmlFor="business-name">
            <span>Business name</span>
            <input id="business-name" {...register("businessName")} />
            {errors.businessName ? (
              <small className="error-message">
                {errors.businessName.message}
              </small>
            ) : null}
          </label>

          <label className="ui-field" htmlFor="business-phone">
            <span>Phone</span>
            <input id="business-phone" {...register("phone")} />
            {errors.phone ? (
              <small className="error-message">{errors.phone.message}</small>
            ) : null}
          </label>

          <label className="ui-field" htmlFor="business-email">
            <span>Email (optional)</span>
            <input id="business-email" type="email" {...register("email")} />
            {errors.email ? (
              <small className="error-message">{errors.email.message}</small>
            ) : null}
          </label>

          <label className="ui-field" htmlFor="business-logo-url">
            <span>Logo URL (optional)</span>
            <input id="business-logo-url" {...register("logoUrl")} />
            {errors.logoUrl ? (
              <small className="error-message">{errors.logoUrl.message}</small>
            ) : null}
          </label>

          <label className="ui-field settings-form-wide" htmlFor="business-address">
            <span>Address</span>
            <textarea id="business-address" rows={4} {...register("address")} />
            {errors.address ? (
              <small className="error-message">{errors.address.message}</small>
            ) : null}
          </label>

          <label className="ui-field" htmlFor="business-currency">
            <span>Currency</span>
            <input disabled id="business-currency" value="PKR" />
          </label>

          <label className="ui-field" htmlFor="business-timezone">
            <span>Reporting timezone</span>
            <input disabled id="business-timezone" value="Asia/Karachi" />
          </label>
        </div>
      </section>

      <section className="management-card">
        <div>
          <p className="eyebrow">Document numbering</p>
          <h2>Prefixes and next numbers</h2>
        </div>

        <p className="form-message">
          A next number cannot be reduced below a number already issued by the system.
        </p>

        <div className="sequence-list">
          {DOCUMENT_TYPES.map((documentType, index) => (
            <div className="sequence-row" key={documentType}>
              <strong>{formatDocumentType(documentType)}</strong>
              <input
                type="hidden"
                {...register(`sequences.${index}.documentType`)}
              />

              <label className="ui-field" htmlFor={`sequence-prefix-${index}`}>
                <span>Prefix</span>
                <input
                  id={`sequence-prefix-${index}`}
                  {...register(`sequences.${index}.prefix`)}
                />
                {errors.sequences?.[index]?.prefix ? (
                  <small className="error-message">
                    {errors.sequences[index]?.prefix?.message}
                  </small>
                ) : null}
              </label>

              <label className="ui-field" htmlFor={`sequence-number-${index}`}>
                <span>Next number</span>
                <input
                  id={`sequence-number-${index}`}
                  min="1"
                  type="number"
                  {...register(`sequences.${index}.nextNumber`, {
                    valueAsNumber: true,
                  })}
                />
                {errors.sequences?.[index]?.nextNumber ? (
                  <small className="error-message">
                    {errors.sequences[index]?.nextNumber?.message}
                  </small>
                ) : null}
              </label>
            </div>
          ))}
        </div>
      </section>

      <div className="form-actions">
        <Button
          disabled={saveMutation.isPending}
          label={saveMutation.isPending ? "Saving..." : "Save settings"}
          type="submit"
        />
      </div>
    </form>
  );
}
