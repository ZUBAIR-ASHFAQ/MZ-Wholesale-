import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import {
  openApiAccessSecurity,
  openApiMutationSecurity,
  openApiPrivateErrors,
  openApiSuccessResponse,
} from "../../shared/http/openapi.js";
import { createDataResponse } from "../../shared/http/response.js";
import { recordAuditLog } from "../system/system.service.js";
import {
  createAttendanceBulkSchema,
  createAttendanceSchema,
  createEmployeeSchema,
  employeeIdParamsSchema,
  listEmployeeAttendanceQuerySchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from "./employees.schema.js";
import {
  createAttendance,
  createAttendanceBulk,
  createEmployee,
  getEmployee,
  listEmployeeAttendance,
  listEmployees,
  updateEmployee,
} from "./employees.service.js";

/** Registers Employee Master and Attendance routes inside the single Employee module. */
export async function registerEmployeeRoutes(app: FastifyInstance): Promise<void> {
  /** Records a successful employee mutation without changing its response if audit storage is unavailable. */
  async function auditMutation(
    request: FastifyRequest,
    action: string,
    afterData: unknown,
    entityType = "EMPLOYEE",
  ): Promise<void> {
    await recordAuditLog(app.db, {
      adminUserId: request.admin?.adminUserId ?? null,
      requestId: request.id,
      ipAddress: request.ip ?? null,
      device: request.headers["user-agent"] ?? null,
    }, action, entityType, null, afterData);
  }

  /** Returns employees using search, active status and pagination filters. */
  async function handleListEmployees(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listEmployeesQuerySchema.parse(request.query);
    const result = await listEmployees(app.db, query);
    reply.send(createDataResponse(result));
  }

  /** Creates one employee master record. */
  async function handleCreateEmployee(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createEmployeeSchema.parse(request.body);
    const employee = await createEmployee(app.db, input);
    await auditMutation(request, "EMPLOYEE_CREATED", employee);
    reply.status(201).send(createDataResponse(employee));
  }

  /** Returns one employee master record. */
  async function handleGetEmployee(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = employeeIdParamsSchema.parse(request.params);
    const employee = await getEmployee(app.db, params.id);
    reply.send(createDataResponse(employee));
  }

  /** Updates employee master data or active status. */
  async function handleUpdateEmployee(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = employeeIdParamsSchema.parse(request.params);
    const input = updateEmployeeSchema.parse(request.body);
    const employee = await updateEmployee(app.db, params.id, input);
    await auditMutation(request, "EMPLOYEE_UPDATED", employee);
    reply.send(createDataResponse(employee));
  }


  /** Returns one employee's attendance history. */
  async function handleListEmployeeAttendance(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = employeeIdParamsSchema.parse(request.params);
    const query = listEmployeeAttendanceQuerySchema.parse(request.query);
    const result = await listEmployeeAttendance(app.db, params.id, query);
    reply.send(createDataResponse(result));
  }

  /** Creates one manual attendance record. */
  async function handleCreateAttendance(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createAttendanceSchema.parse(request.body);
    const attendance = await createAttendance(app.db, input);
    await auditMutation(request, "EMPLOYEE_ATTENDANCE_CREATED", attendance, "EMPLOYEE_ATTENDANCE");
    reply.status(201).send(createDataResponse(attendance));
  }

  /** Creates one validated attendance batch in one database statement. */
  async function handleCreateAttendanceBulk(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createAttendanceBulkSchema.parse(request.body);
    const attendance = await createAttendanceBulk(app.db, input);
    await auditMutation(request, "EMPLOYEE_ATTENDANCE_BULK_CREATED", attendance, "EMPLOYEE_ATTENDANCE");
    reply.status(201).send(createDataResponse(attendance));
  }

  /** Builds one documented Employee route without changing Zod validation. */
  function privateRoute(summary: string, mutation = false) {
    return {
      preHandler: app.authenticate,
      schema: {
        tags: ["employees"],
        summary,
        security: mutation ? openApiMutationSecurity : openApiAccessSecurity,
        response: {
          200: openApiSuccessResponse,
          201: openApiSuccessResponse,
          ...openApiPrivateErrors,
        },
      },
    };
  }

  app.get("/employees", privateRoute("List and search employees"), handleListEmployees);
  app.post("/employees", privateRoute("Create an employee", true), handleCreateEmployee);
  app.post("/employees/attendance", privateRoute("Create employee attendance", true), handleCreateAttendance);
  app.post("/employees/attendance/bulk", privateRoute("Create bulk employee attendance", true), handleCreateAttendanceBulk);
  app.get("/employees/:id/attendance", privateRoute("List employee attendance"), handleListEmployeeAttendance);
  app.get("/employees/:id", privateRoute("Load an employee"), handleGetEmployee);
  app.patch("/employees/:id", privateRoute("Update an employee", true), handleUpdateEmployee);
}
