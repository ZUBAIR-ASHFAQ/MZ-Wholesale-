import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { executeIdempotentMutation } from "../../shared/http/idempotency.js";
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
  createEmployeeAdvanceSchema,
  createAttendanceSchema,
  createEmployeeLeaveSchema,
  createEmployeeSchema,
  createLeaveTypeSchema,
  employeeIdParamsSchema,
  employeeAdvanceIdParamsSchema,
  employeeLeaveIdParamsSchema,
  leaveTypeIdParamsSchema,
  listEmployeeAdvancesQuerySchema,
  listEmployeeAttendanceQuerySchema,
  listEmployeeLeavesQuerySchema,
  listEmployeesQuerySchema,
  listPayrollRunsQuerySchema,
  listSalaryPaymentsQuerySchema,
  payrollRunIdParamsSchema,
  salaryPaymentIdParamsSchema,
  recoverEmployeeAdvanceSchema,
  reverseSalaryPaymentSchema,
  updateEmployeeLeaveSchema,
  updateEmployeeSchema,
  updateLeaveTypeSchema,
  createPayrollRunSchema,
  createSalaryPaymentSchema,
  updatePayrollRunSchema,
} from "./employees.schema.js";
import {
  createAttendance,
  createAttendanceBulk,
  createEmployeeAdvanceInTransaction,
  createEmployee,
  createEmployeeLeave,
  createLeaveType,
  getEmployee,
  getSalaryPayment,
  listEmployeeAdvances,
  listEmployeeAttendance,
  listEmployeeLeaves,
  listEmployees,
  listLeaveTypes,
  listPayrollRuns,
  listSalaryPayments,
  getPayrollRun,
  confirmPayrollRunInTransaction,
  createPayrollRunInTransaction,
  createSalaryPaymentInTransaction,
  updatePayrollRunInTransaction,
  updateEmployee,
  recoverEmployeeAdvanceInTransaction,
  reverseSalaryPaymentInTransaction,
  updateEmployeeLeave,
  updateLeaveType,
} from "./employees.service.js";

/** Registers Employee Master, Attendance, Leave, Advance, and Payroll routes inside the single Employee module. */
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

  /** Executes one idempotent Employee financial mutation in the shared database transaction. */
  async function sendIdempotentEmployeeFinancialMutation(
    request: FastifyRequest,
    reply: FastifyReply,
    body: unknown,
    operation: (transaction: FastifyInstance["db"]) => Promise<unknown>,
    statusCode = 201,
  ): Promise<boolean> {
    const response = await executeIdempotentMutation(
      app.db,
      {
        key: request.headers["idempotency-key"],
        method: request.method,
        path: request.routeOptions.url,
        body,
      },
      async (transaction) => ({
        statusCode,
        body: createDataResponse(await operation(transaction)),
      }),
    );

    reply.status(response.statusCode).send(response.body);
    return response.replayed;
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

  /** Lists reusable Leave Types. */
  async function handleListLeaveTypes(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    reply.send(createDataResponse(await listLeaveTypes(app.db)));
  }

  /** Creates one reusable Leave Type. */
  async function handleCreateLeaveType(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createLeaveTypeSchema.parse(request.body);
    const leaveType = await createLeaveType(app.db, input);
    await auditMutation(request, "EMPLOYEE_LEAVE_TYPE_CREATED", leaveType, "EMPLOYEE_LEAVE_TYPE");
    reply.status(201).send(createDataResponse(leaveType));
  }

  /** Updates one reusable Leave Type. */
  async function handleUpdateLeaveType(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = leaveTypeIdParamsSchema.parse(request.params);
    const input = updateLeaveTypeSchema.parse(request.body);
    const leaveType = await updateLeaveType(app.db, params.id, input);
    await auditMutation(request, "EMPLOYEE_LEAVE_TYPE_UPDATED", leaveType, "EMPLOYEE_LEAVE_TYPE");
    reply.send(createDataResponse(leaveType));
  }

  /** Lists Employee Leave workflow rows. */
  async function handleListEmployeeLeaves(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listEmployeeLeavesQuerySchema.parse(request.query);
    reply.send(createDataResponse(await listEmployeeLeaves(app.db, query)));
  }

  /** Creates one Employee Leave workflow row. */
  async function handleCreateEmployeeLeave(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createEmployeeLeaveSchema.parse(request.body);
    const leave = await app.db.transaction((transaction) =>
      createEmployeeLeave(transaction, input));
    await auditMutation(request, "EMPLOYEE_LEAVE_CREATED", leave, "EMPLOYEE_LEAVE");
    reply.status(201).send(createDataResponse(leave));
  }

  /** Updates one Employee Leave workflow row. */
  async function handleUpdateEmployeeLeave(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = employeeLeaveIdParamsSchema.parse(request.params);
    const input = updateEmployeeLeaveSchema.parse(request.body);
    const leave = await app.db.transaction((transaction) =>
      updateEmployeeLeave(transaction, params.id, input));
    await auditMutation(request, "EMPLOYEE_LEAVE_UPDATED", leave, "EMPLOYEE_LEAVE");
    reply.send(createDataResponse(leave));
  }

  /** Lists Employee Advances with derived recovered/outstanding amounts. */
  async function handleListEmployeeAdvances(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listEmployeeAdvancesQuerySchema.parse(request.query);
    reply.send(createDataResponse(await listEmployeeAdvances(app.db, query)));
  }

  /** Creates one Employee Advance through an idempotent financial transaction. */
  async function handleCreateEmployeeAdvance(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createEmployeeAdvanceSchema.parse(request.body);
    const replayed = await sendIdempotentEmployeeFinancialMutation(
      request,
      reply,
      input,
      (transaction) => createEmployeeAdvanceInTransaction(transaction, input),
    );

    if (!replayed) {
      await auditMutation(request, "EMPLOYEE_ADVANCE_CREATED", { input }, "EMPLOYEE_ADVANCE");
    }
  }

  /** Directly recovers one Employee Advance through an idempotent financial transaction. */
  async function handleRecoverEmployeeAdvance(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = employeeAdvanceIdParamsSchema.parse(request.params);
    const input = recoverEmployeeAdvanceSchema.parse(request.body);
    const replayed = await sendIdempotentEmployeeFinancialMutation(
      request,
      reply,
      { params, input },
      (transaction) => recoverEmployeeAdvanceInTransaction(transaction, params.id, input),
    );

    if (!replayed) {
      await auditMutation(
        request,
        "EMPLOYEE_ADVANCE_RECOVERED",
        { employeeAdvanceId: params.id, input },
        "EMPLOYEE_ADVANCE_RECOVERY",
      );
    }
  }

  /** Lists Payroll Runs using status/date/pagination filters. */
  async function handleListPayrollRuns(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listPayrollRunsQuerySchema.parse(request.query);
    reply.send(createDataResponse(await listPayrollRuns(app.db, query)));
  }

  /** Creates and calculates one DRAFT Payroll Run atomically. */
  async function handleCreatePayrollRun(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createPayrollRunSchema.parse(request.body);
    const payroll = await app.db.transaction((transaction) =>
      createPayrollRunInTransaction(transaction, input));
    await auditMutation(request, "PAYROLL_DRAFT_CREATED", payroll, "PAYROLL_RUN");
    reply.status(201).send(createDataResponse(payroll));
  }

  /** Loads one Payroll Run with all calculated employee rows. */
  async function handleGetPayrollRun(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = payrollRunIdParamsSchema.parse(request.params);
    reply.send(createDataResponse(await getPayrollRun(app.db, params.id)));
  }

  /** Recalculates editable fields of one DRAFT Payroll Run atomically. */
  async function handleUpdatePayrollRun(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = payrollRunIdParamsSchema.parse(request.params);
    const input = updatePayrollRunSchema.parse(request.body);
    const payroll = await app.db.transaction((transaction) =>
      updatePayrollRunInTransaction(transaction, params.id, input));
    await auditMutation(request, "PAYROLL_DRAFT_UPDATED", payroll, "PAYROLL_RUN");
    reply.send(createDataResponse(payroll));
  }

  /** Confirms one DRAFT Payroll Run through the shared idempotency transaction. */
  async function handleConfirmPayrollRun(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = payrollRunIdParamsSchema.parse(request.params);
    const response = await executeIdempotentMutation(
      app.db,
      {
        key: request.headers["idempotency-key"],
        method: request.method,
        path: request.routeOptions.url,
        body: { payrollRunId: params.id },
      },
      async (transaction) => ({
        statusCode: 200,
        body: createDataResponse(
          await confirmPayrollRunInTransaction(transaction, params.id),
        ),
      }),
    );

    if (!response.replayed) {
      await auditMutation(
        request,
        "PAYROLL_CONFIRMED",
        { payrollRunId: params.id },
        "PAYROLL_RUN",
      );
    }

    reply.status(response.statusCode).send(response.body);
  }

  /** Lists Salary Payments using employee/date/pagination filters. */
  async function handleListSalaryPayments(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = listSalaryPaymentsQuerySchema.parse(request.query);
    reply.send(createDataResponse(await listSalaryPayments(app.db, query)));
  }

  /** Creates one Salary Payment through the shared idempotency transaction. */
  async function handleCreateSalaryPayment(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const input = createSalaryPaymentSchema.parse(request.body);
    const replayed = await sendIdempotentEmployeeFinancialMutation(
      request,
      reply,
      input,
      (transaction) => createSalaryPaymentInTransaction(transaction, input),
    );

    if (!replayed) {
      await auditMutation(request, "SALARY_PAYMENT_CREATED", { input }, "SALARY_PAYMENT");
    }
  }

  /** Loads one Salary Payment with its immutable splits and allocations. */
  async function handleGetSalaryPayment(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = salaryPaymentIdParamsSchema.parse(request.params);
    reply.send(createDataResponse(await getSalaryPayment(app.db, params.id)));
  }

  /** Reverses one Salary Payment through the shared idempotency transaction. */
  async function handleReverseSalaryPayment(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const params = salaryPaymentIdParamsSchema.parse(request.params);
    const input = reverseSalaryPaymentSchema.parse(request.body);
    const replayed = await sendIdempotentEmployeeFinancialMutation(
      request,
      reply,
      { params, input },
      (transaction) => reverseSalaryPaymentInTransaction(transaction, params.id, input),
      200,
    );

    if (!replayed) {
      await auditMutation(
        request,
        "SALARY_PAYMENT_REVERSED",
        { salaryPaymentId: params.id, reason: input.reason },
        "SALARY_PAYMENT",
      );
    }
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

  app.get("/salary-payments", privateRoute("List salary payments"), handleListSalaryPayments);
  app.post("/salary-payments", privateRoute("Create a salary payment", true), handleCreateSalaryPayment);
  app.get("/salary-payments/:id", privateRoute("Load a salary payment"), handleGetSalaryPayment);
  app.post("/salary-payments/:id/reverse", privateRoute("Reverse a salary payment", true), handleReverseSalaryPayment);
  app.get("/payroll-runs", privateRoute("List payroll runs"), handleListPayrollRuns);
  app.post("/payroll-runs", privateRoute("Create a draft payroll run", true), handleCreatePayrollRun);
  app.get("/payroll-runs/:id", privateRoute("Load a payroll run"), handleGetPayrollRun);
  app.patch("/payroll-runs/:id", privateRoute("Update a draft payroll run", true), handleUpdatePayrollRun);
  app.post("/payroll-runs/:id/confirm", privateRoute("Confirm a payroll run", true), handleConfirmPayrollRun);
  app.get("/leave-types", privateRoute("List employee leave types"), handleListLeaveTypes);
  app.post("/leave-types", privateRoute("Create an employee leave type", true), handleCreateLeaveType);
  app.patch("/leave-types/:id", privateRoute("Update an employee leave type", true), handleUpdateLeaveType);
  app.get("/employee-leaves", privateRoute("List employee leave records"), handleListEmployeeLeaves);
  app.post("/employee-leaves", privateRoute("Create an employee leave record", true), handleCreateEmployeeLeave);
  app.patch("/employee-leaves/:id", privateRoute("Update an employee leave record", true), handleUpdateEmployeeLeave);
  app.get("/employee-advances", privateRoute("List employee advances"), handleListEmployeeAdvances);
  app.post("/employee-advances", privateRoute("Create an employee advance", true), handleCreateEmployeeAdvance);
  app.post("/employee-advances/:id/recover", privateRoute("Recover an employee advance", true), handleRecoverEmployeeAdvance);
  app.get("/employees", privateRoute("List and search employees"), handleListEmployees);
  app.post("/employees", privateRoute("Create an employee", true), handleCreateEmployee);
  app.post("/employees/attendance", privateRoute("Create employee attendance", true), handleCreateAttendance);
  app.post("/employees/attendance/bulk", privateRoute("Create bulk employee attendance", true), handleCreateAttendanceBulk);
  app.get("/employees/:id/attendance", privateRoute("List employee attendance"), handleListEmployeeAttendance);
  app.get("/employees/:id", privateRoute("Load an employee"), handleGetEmployee);
  app.patch("/employees/:id", privateRoute("Update an employee", true), handleUpdateEmployee);
}
