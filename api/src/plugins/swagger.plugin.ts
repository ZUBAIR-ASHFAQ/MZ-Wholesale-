import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

/** Registers the generated OpenAPI document and its development UI. */
export async function registerSwaggerPlugin(
  app: FastifyInstance,
): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Wholesale Distributor ERP API",
        version: "0.9.22",
        description:
          "Fastify API for the walk-in wholesale counter ERP. Authentication uses secure cookies and mutation routes require the X-CSRF-Token header.",
      },
      tags: [
        { name: "health", description: "Deployment readiness checks." },
        { name: "auth", description: "Single-admin authentication and sessions." },
        { name: "business-settings", description: "Business identity and document sequences." },
        { name: "products", description: "Products, categories, brands and units." },
        { name: "customers", description: "Walk-in and credit-customer master data." },
        { name: "suppliers", description: "Supplier master data." },
        { name: "inventory", description: "Stock balances, movements, adjustments and counts." },
        { name: "ledgers", description: "Customer and supplier statements, outstanding dues and payables." },
        { name: "payments", description: "Cash and bank accounts, customer receipts, supplier payments, movements, transfers and reconciliation." },
        { name: "purchases", description: "Supplier purchases, item snapshots, and purchase history." },
        { name: "sales", description: "Counter sales, manual pricing, and sale confirmation." },
        { name: "dashboard", description: "Read-only business overview and low-stock alerts." },
        { name: "system", description: "Opening-data imports, audit logs, and report exports." },
      ],
      components: {
        securitySchemes: {
          accessCookie: {
            type: "apiKey",
            in: "cookie",
            name: "erp_access_session",
            description: "HttpOnly access-session cookie set after login.",
          },
          refreshCookie: {
            type: "apiKey",
            in: "cookie",
            name: "erp_refresh_session",
            description: "HttpOnly refresh-session cookie used only by refresh and logout.",
          },
          csrfHeader: {
            type: "apiKey",
            in: "header",
            name: "X-CSRF-Token",
            description: "Must match the readable CSRF cookie on mutation requests.",
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/documentation",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
    staticCSP: true,
  });
}
