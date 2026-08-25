import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function between(text: string, start: string, end: string): string {
  const startIndex = text.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return text.slice(startIndex, endIndex);
}


test("employee deactivation requires an employment end date", async () => {
  const service = await source("src/modules/employees/employees.service.ts");
  const updateEmployee = between(
    service,
    "export async function updateEmployee",
    "/** Lists one employee's attendance history",
  );

  assert.match(updateEmployee, /const effectiveIsActive = input\.isActive \?\? existingEmployee\.isActive/);
  assert.match(updateEmployee, /if \(!effectiveIsActive && !effectiveLeaveDate\)/);
  assert.match(updateEmployee, /"EMPLOYEE_LEAVE_DATE_REQUIRED"/);
});

test("employee lifecycle keeps active status and leave date consistent", async () => {
  const [databaseSchema, service, form, migration] = await Promise.all([
    source("src/database/schema/employee.schema.ts"),
    source("src/modules/employees/employees.service.ts"),
    source("../web-admin/src/features/employees/components/employee-form.tsx"),
    source("../api/drizzle/0026_employee_active_leave_date_consistency.sql"),
  ]);
  const createEmployee = between(
    service,
    "export async function createEmployee",
    "/** Loads one employee master record",
  );
  const updateEmployee = between(
    service,
    "export async function updateEmployee",
    "/** Lists one employee's attendance history",
  );

  assert.match(createEmployee, /if \(input\.leaveDate\)/);
  assert.match(createEmployee, /"EMPLOYEE_ACTIVE_LEAVE_DATE_NOT_ALLOWED"/);
  assert.match(updateEmployee, /const effectiveIsActive = input\.isActive \?\? existingEmployee\.isActive/);
  assert.match(updateEmployee, /if \(effectiveIsActive && input\.leaveDate\)/);
  assert.match(updateEmployee, /const effectiveLeaveDate = effectiveIsActive \? null : requestedLeaveDate/);
  assert.match(updateEmployee, /if \(!effectiveIsActive && !effectiveLeaveDate\)/);
  assert.match(updateEmployee, /"EMPLOYEE_LEAVE_DATE_REQUIRED"/);
  assert.match(updateEmployee, /if \(effectiveIsActive && existingEmployee\.leaveDate !== null\)/);
  assert.match(updateEmployee, /changes\.leaveDate = null/);

  assert.match(databaseSchema, /"employees_active_leave_date_check"/);
  assert.match(migration, /WHERE "is_active" = true AND "leave_date" IS NOT NULL/);
  assert.match(migration, /CHECK \("is_active" = false OR "leave_date" IS NULL\)/);
  assert.match(form, /leaveDate: values\.isActive \? null : values\.leaveDate \|\| null/);
  assert.match(form, /\{!isActive \? \(/);
});

test("attendance keeps database and service duplicate protection", async () => {
  const [databaseSchema, service] = await Promise.all([
    source("src/database/schema/employee.schema.ts"),
    source("src/modules/employees/employees.service.ts"),
  ]);

  assert.match(databaseSchema, /uniqueIndex\("attendance_records_employee_date_unique"\)/);
  assert.match(service, /readPostgresConstraint\(error\) === "attendance_records_employee_date_unique"/);
  assert.match(service, /"DUPLICATE_ATTENDANCE"/);
  assert.match(service, /validateAttendanceEmploymentDate\(employee, input\.attendanceDate\)/);
});

test("saved attendance can be corrected without replacing employee/date identity", async () => {
  const [schema, repository, service, routes, api, hooks, page] = await Promise.all([
    source("src/modules/employees/employees.schema.ts"),
    source("src/modules/employees/employees.repository.ts"),
    source("src/modules/employees/employees.service.ts"),
    source("src/modules/employees/employees.routes.ts"),
    source("../web-admin/src/features/employees/api/employees.api.ts"),
    source("../web-admin/src/features/employees/hooks/use-employees.ts"),
    source("../web-admin/src/features/employees/pages/attendance-page.tsx"),
  ]);

  const updateSchema = between(
    schema,
    "/** Validates editable attendance fields while keeping employee/date identity immutable. */",
    "/** Validates an atomic bulk attendance request",
  );
  const updateService = between(
    service,
    "/** Corrects editable attendance values while preserving employee/date identity. */",
    "/** Creates one attendance batch",
  );

  assert.match(updateSchema, /omit\(\{ employeeId: true, attendanceDate: true \}\)/);
  assert.match(updateSchema, /\.partial\(\)/);
  assert.match(updateSchema, /hasAtLeastOneField/);
  assert.match(repository, /export async function findAttendanceById/);
  assert.match(repository, /export async function updateAttendanceRecord/);
  assert.match(updateService, /lockPayrollConfirmationScope\(database\)/);
  assert.match(updateService, /requireAttendanceRecord\(database, attendanceId\)/);
  assert.match(updateService, /validateAttendanceEmploymentDate\(employee, existingAttendance\.attendanceDate\)/);
  assert.match(updateService, /saveAttendanceChanges\(database, attendanceId, changes\)/);
  assert.doesNotMatch(updateService, /employeeId\s*=/);
  assert.doesNotMatch(updateService, /attendanceDate\s*=/);
  assert.match(routes, /app\.db\.transaction/);
  assert.match(routes, /app\.patch\("\/employees\/attendance\/:id"/);
  assert.match(routes, /"EMPLOYEE_ATTENDANCE_UPDATED"/);
  assert.match(api, /export async function updateAttendance/);
  assert.match(api, /method: "PATCH"/);
  assert.match(hooks, /export function useUpdateAttendance/);
  assert.match(page, /Save correction/);
  assert.match(page, /updateAttendance\.mutateAsync/);
});

test("attendance work details stay consistent with the selected status", async () => {
  const [service, page, reportsRepository] = await Promise.all([
    source("src/modules/employees/employees.service.ts"),
    source("../web-admin/src/features/employees/pages/attendance-page.tsx"),
    source("src/modules/reports/reports.repository.ts"),
  ]);

  const consistencyGuard = between(
    service,
    "/** Rejects attendance details that contradict the selected attendance status. */",
    "/** Converts validated attendance input into the existing attendance table shape. */",
  );
  const updateAttendance = between(
    service,
    "/** Corrects editable attendance values while preserving employee/date identity. */",
    "/** Creates one attendance batch",
  );
  const bulkAttendance = between(
    service,
    "/** Creates one attendance batch after validating every employee/date before the insert. */",
    "/** Lists all Leave Types in stable name order. */",
  );

  assert.match(consistencyGuard, /input\.status === "PRESENT" \|\| input\.status === "HALF_DAY"/);
  assert.match(consistencyGuard, /"ATTENDANCE_NON_WORK_DETAILS_NOT_ALLOWED"/);
  assert.match(consistencyGuard, /"ATTENDANCE_CHECK_IN_REQUIRED"/);
  assert.match(consistencyGuard, /"ATTENDANCE_CHECK_OUT_REQUIRED"/);
  assert.match(consistencyGuard, /"ATTENDANCE_WORKED_HOURS_REQUIRED"/);
  assert.match(consistencyGuard, /checkOutSeconds <= checkInSeconds/);
  assert.match(consistencyGuard, /"ATTENDANCE_TIME_ORDER_INVALID"/);
  assert.match(consistencyGuard, /workedSeconds > checkOutSeconds - checkInSeconds/);
  assert.match(consistencyGuard, /"ATTENDANCE_WORKED_HOURS_EXCEED_SPAN"/);
  assert.match(service, /validateAttendanceFieldConsistency\(\{[\s\S]*status: input\.status/);
  assert.match(updateAttendance, /status: input\.status \?\? existingAttendance\.status/);
  assert.match(updateAttendance, /validateAttendanceFieldConsistency/);
  assert.match(bulkAttendance, /validateAttendanceFieldConsistency/);
  assert.match(service, /for \(const record of attendance\) \{\n    validateAttendanceFieldConsistency\(record\)/);

  assert.match(page, /function isWorkingAttendanceStatus/);
  assert.match(page, /function attendanceDraftError/);
  assert.match(page, /workDetailsDisabled/);
  assert.match(page, /status, checkIn: "", checkOut: "", workedHours: ""/);
  assert.match(page, /setSaveError\(`\$\{employee\.employeeCode\}: \$\{validationError\}`\)/);

  assert.match(
    reportsRepository,
    /sum\(\$\{attendanceRecords\.workedHours\}\) filter \(where \$\{attendanceRecords\.status\} in \('PRESENT', 'HALF_DAY'\)\)/,
  );
});

test("Employee Leave days are authoritative from the inclusive date range", async () => {
  const [databaseSchema, service, form, migration] = await Promise.all([
    source("src/database/schema/employee.schema.ts"),
    source("src/modules/employees/employees.service.ts"),
    source("../web-admin/src/features/employees/components/leave-form.tsx"),
    source("../api/drizzle/0027_employee_leave_days_match_date_range.sql"),
  ]);
  const createLeave = between(
    service,
    "export async function createEmployeeLeave",
    "/** Updates one Employee Leave record",
  );
  const updateLeave = between(
    service,
    "export async function updateEmployeeLeave",
    "/** Employee Advance list row",
  );

  assert.match(service, /function calculateLeaveDays/);
  assert.match(service, /function validateLeaveDays/);
  assert.match(service, /"LEAVE_DAYS_DATE_RANGE_MISMATCH"/);
  assert.match(createLeave, /const days = validateLeaveDays\(input\.days, input\.fromDate, input\.toDate\)/);
  assert.match(createLeave, /days,/);
  assert.match(updateLeave, /calculateLeaveDays\(fromDate, toDate\)/);
  assert.match(updateLeave, /validateLeaveDays\(input\.days, fromDate, toDate\)/);
  assert.match(updateLeave, /changes\.days = days/);
  assert.match(form, /function calculateLeaveDays/);
  assert.match(form, /setValue\("days", calculateLeaveDays\(fromDate, toDate\)/);
  assert.match(form, /<input readOnly \{\.\.\.form\.register\("days"\)\} \/>/);
  assert.match(databaseSchema, /"employee_leaves_days_match_range_check"/);
  assert.match(migration, /SET "days" = \("to_date" - "from_date" \+ 1\)::numeric/);
  assert.match(migration, /ADD CONSTRAINT "employee_leaves_days_match_range_check"/);
});

test("approved leave overlap checks are serialized inside route transactions", async () => {
  const [repository, service, routes] = await Promise.all([
    source("src/modules/employees/employees.repository.ts"),
    source("src/modules/employees/employees.service.ts"),
    source("src/modules/employees/employees.routes.ts"),
  ]);

  assert.match(repository, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(repository, /employee_leave:\$\{employeeId\}/);
  assert.match(service, /lockEmployeeLeaveApprovalScope\(database, input\.employeeId\)/);
  assert.match(service, /lockEmployeeLeaveApprovalScope\(database, employeeId\)/);

  const createLeave = between(routes, "async function handleCreateEmployeeLeave", "/** Updates one Employee Leave workflow row");
  const updateLeave = between(routes, "async function handleUpdateEmployeeLeave", "/** Lists Employee Advances");
  assert.match(createLeave, /app\.db\.transaction/);
  assert.match(updateLeave, /app\.db\.transaction/);
});

test("employee advance and direct recovery dates cannot be future-dated", async () => {
  const schema = await source("src/modules/employees/employees.schema.ts");
  const advanceSchema = between(
    schema,
    "export const createEmployeeAdvanceSchema",
    "/** Validates one direct recovery",
  );
  const recoverySchema = between(
    schema,
    "export const recoverEmployeeAdvanceSchema",
    "/** Validates a Payroll Run UUID",
  );

  assert.match(advanceSchema, /isBusinessDateNotFuture/);
  assert.match(advanceSchema, /Advance date cannot be in the future/);
  assert.match(recoverySchema, /isBusinessDateNotFuture/);
  assert.match(recoverySchema, /Recovery date cannot be in the future/);
});

test("employee advance payment and direct recovery keep opposite immutable cash effects", async () => {
  const service = await source("src/modules/employees/employees.service.ts");
  const createAdvance = between(
    service,
    "export async function createEmployeeAdvanceInTransaction",
    "/** Directly recovers an Employee Advance",
  );
  const recoverAdvance = between(
    service,
    "export async function recoverEmployeeAdvanceInTransaction",
    "/** One Payroll Item enriched",
  );

  assert.match(createAdvance, /if \(!employee\.isActive\)/);
  assert.match(createAdvance, /referenceType: "EMPLOYEE_ADVANCE"/);
  assert.match(createAdvance, /await writeCashOutflow\(database, movement\)/);
  assert.match(createAdvance, /await writeBankOutflow\(database, movement\)/);

  assert.match(recoverAdvance, /lockEmployeeAdvanceById/);
  assert.match(recoverAdvance, /"EMPLOYEE_ADVANCE_RECOVERY_EXCEEDED"/);
  assert.match(recoverAdvance, /referenceType: "ADVANCE_RECOVERY"/);
  assert.match(recoverAdvance, /await writeCashInflow\(database, movement\)/);
  assert.match(recoverAdvance, /await writeBankInflow\(database, movement\)/);
  assert.doesNotMatch(recoverAdvance, /if \(!employee\.isActive\)/);
});


test("employee cash and bank outflows cannot overdraw an account", async () => {
  const [employeeService, paymentsService] = await Promise.all([
    source("src/modules/employees/employees.service.ts"),
    source("src/modules/payments/payments.service.ts"),
  ]);
  const movementWriter = between(
    paymentsService,
    "async function writeAccountMovement",
    "// Account movement writers",
  );
  const createAdvance = between(
    employeeService,
    "export async function createEmployeeAdvanceInTransaction",
    "/** Directly recovers an Employee Advance",
  );
  const createSalaryPayment = between(
    employeeService,
    "export async function createSalaryPaymentInTransaction",
    "/** Reverses one Salary Payment",
  );

  assert.match(movementWriter, /direction === "OUTFLOW"[\s\S]*lockCashAccount/);
  assert.match(movementWriter, /direction === "OUTFLOW"[\s\S]*lockBankAccount/);
  assert.match(movementWriter, /readCashAccountBalance/);
  assert.match(movementWriter, /readBankAccountBalance/);
  assert.match(movementWriter, /moneyToCents\(balance\) < moneyToCents\(input\.amount\)/);
  assert.match(movementWriter, /"INSUFFICIENT_ACCOUNT_BALANCE"/);
  assert.match(movementWriter, /"amount"/);
  assert.match(paymentsService, /function sortPaymentSplitsByAccount/);
  assert.match(paymentsService, /for \(const split of sortPaymentSplitsByAccount\(splits\)\)/);
  assert.match(paymentsService, /for \(const split of sortPaymentSplitsByAccount\(input\.splits\)\)/);
  assert.match(createAdvance, /writeCashOutflow\(database, movement\)/);
  assert.match(createAdvance, /writeBankOutflow\(database, movement\)/);
  assert.match(createSalaryPayment, /const movementSplits = \[\.\.\.splits\]\.sort/);
  assert.match(createSalaryPayment, /writeCashOutflow\(database, movement\)/);
  assert.match(createSalaryPayment, /writeBankOutflow\(database, movement\)/);
});

test("draft payroll prorates monthly salary to the covered employment period", async () => {
  const service = await source("src/modules/employees/employees.service.ts");
  const proration = between(
    service,
    "/** Prorates one monthly salary over the calendar days covered by a payroll period. */",
    "/** Formats hundredths of one day",
  );
  const calculateItem = between(
    service,
    "function calculateDraftPayrollItem",
    "/** Recalculates all employee rows",
  );

  assert.match(proration, /daysInMonth/);
  assert.match(proration, /coveredDays/);
  assert.match(proration, /divideRoundHalfUp/);
  assert.match(calculateItem, /employee\.joinDate > periodStart/);
  assert.match(calculateItem, /employee\.leaveDate && employee\.leaveDate < periodEnd/);
  assert.match(calculateItem, /prorateMonthlySalaryCents\(/);
  assert.doesNotMatch(calculateItem, /const grossCents = moneyToCents\(employee\.baseMonthlySalary\)/);
});

test("draft payroll rejects incomplete attendance coverage before salary calculation", async () => {
  const service = await source("src/modules/employees/employees.service.ts");
  const coverage = between(
    service,
    "/** Requires one attendance status for every employment date covered by payroll. */",
    "/** Validates reasons and advance recovery before calculating one draft Payroll Item. */",
  );
  const calculateItem = between(
    service,
    "function calculateDraftPayrollItem",
    "/** Recalculates all employee rows",
  );

  assert.match(coverage, /employee\.joinDate > periodStart/);
  assert.match(coverage, /employee\.leaveDate && employee\.leaveDate < periodEnd/);
  assert.match(coverage, /new Set\(attendance\.map\(\(record\) => record\.attendanceDate\)\)/);
  assert.match(coverage, /for \(let date = coverageStart; date <= coverageEnd; date = nextPayrollBusinessDate\(date\)\)/);
  assert.match(coverage, /"PAYROLL_ATTENDANCE_INCOMPLETE"/);
  assert.match(coverage, /including holidays and weekly off days/);
  assert.match(calculateItem, /validatePayrollAttendanceCoverage\(employee, periodStart, periodEnd, attendance\)/);
});

test("attendance and payroll mutations reject future business dates in backend and UI", async () => {
  const [schema, service, attendancePage, payrollNewPage, payrollDetailPage] = await Promise.all([
    source("src/modules/employees/employees.schema.ts"),
    source("src/modules/employees/employees.service.ts"),
    source("../web-admin/src/features/employees/pages/attendance-page.tsx"),
    source("../web-admin/src/features/employees/pages/payroll-new-page.tsx"),
    source("../web-admin/src/features/employees/pages/payroll-detail-page.tsx"),
  ]);
  const attendanceSchema = between(
    schema,
    "const attendanceDateSchema",
    "const payrollPeriodDateSchema",
  );
  const payrollSchema = between(
    schema,
    "const payrollPeriodDateSchema",
    "const employeeCodeSchema",
  );
  const attendanceGuard = between(
    service,
    "/** Rejects future attendance and dates outside one employee's valid employment dates. */",
    "/** Normalizes optional attendance text",
  );
  const payrollCalculation = between(
    service,
    "async function calculateDraftPayroll",
    "const employees = await findPayrollEmployeesForPeriod",
  );

  assert.match(attendanceSchema, /isBusinessDateNotFuture/);
  assert.match(attendanceSchema, /Attendance date cannot be in the future/);
  assert.match(payrollSchema, /isBusinessDateNotFuture/);
  assert.match(payrollSchema, /Payroll period cannot be in the future/);
  assert.match(attendanceGuard, /attendanceDate > currentBusinessDate\(\)/);
  assert.match(attendanceGuard, /"ATTENDANCE_DATE_FUTURE"/);
  assert.match(payrollCalculation, /periodEnd > currentBusinessDate\(\)/);
  assert.match(payrollCalculation, /"PAYROLL_PERIOD_FUTURE"/);
  assert.match(attendancePage, /max=\{today\}/);
  assert.match(attendancePage, /attendanceDate > today/);
  assert.match(payrollNewPage, /periodEnd > today/);
  assert.match(payrollNewPage, /max=\{today\}/);
  assert.match(payrollDetailPage, /periodEnd > today/);
  assert.match(payrollDetailPage, /max=\{today\}/);
});

test("payroll confirmation creates payable and payroll recovery without cash movement", async () => {
  const service = await source("src/modules/employees/employees.service.ts");
  const confirmRecovery = between(
    service,
    "async function confirmPayrollAdvanceRecovery",
    "/** Confirms one DRAFT Payroll Run",
  );
  const confirmPayroll = between(
    service,
    "export async function confirmPayrollRunInTransaction",
    "/** Contains one Salary Payment header",
  );
  const combined = `${confirmRecovery}\n${confirmPayroll}`;

  assert.match(confirmRecovery, /listPayrollAdvancesForEmployeeForUpdate/);
  assert.match(confirmRecovery, /payrollItemId: item\.id/);
  assert.match(confirmRecovery, /referenceType: "ADVANCE_RECOVERY"/);
  assert.match(confirmPayroll, /calculateDraftPayroll\(/);
  assert.match(confirmPayroll, /readExistingPayrollAdjustments\(currentItems\)/);
  assert.match(confirmPayroll, /deletePayrollItemsByRun\(database, run\.id\)/);
  assert.match(confirmPayroll, /insertPayrollItems\(database, calculation\.items\)/);
  assert.match(confirmPayroll, /referenceType: "PAYROLL"/);
  assert.match(confirmPayroll, /credit: item\.initialDueAmount/);
  assert.match(confirmPayroll, /markPayrollRunConfirmed/);
  assert.doesNotMatch(combined, /writeCash(?:Inflow|Outflow)|writeBank(?:Inflow|Outflow)/);
});

test("salary payment is allocation-safe and reversal restores payable plus account balance", async () => {
  const [service, repository] = await Promise.all([
    source("src/modules/employees/employees.service.ts"),
    source("src/modules/employees/employees.repository.ts"),
  ]);
  const validatePayment = between(
    service,
    "async function validateSalaryPaymentRequest",
    "/** Creates a Salary Payment",
  );
  const createPayment = between(
    service,
    "export async function createSalaryPaymentInTransaction",
    "/** Reverses one Salary Payment",
  );
  const reversePayment = service.slice(service.indexOf("export async function reverseSalaryPaymentInTransaction"));
  const lockedPayables = between(
    repository,
    "export async function lockSalaryPaymentPayrollItems",
    "/** Derives confirmed salary-payment totals",
  );

  assert.match(lockedPayables, /\.for\("update"\)/);
  assert.match(lockedPayables, /eq\(salaryPayments\.status, "CONFIRMED"\)/);
  assert.match(lockedPayables, /isNull\(salaryPayments\.reversalOfPaymentId\)/);
  assert.match(validatePayment, /moneyToCents\(item\.initialDueAmount\) - moneyToCents\(item\.allocatedAmount\)/);
  assert.match(validatePayment, /"SALARY_ALLOCATION_EXCEEDS_PAYABLE"/);

  assert.match(createPayment, /insertSalaryPaymentSplits/);
  assert.match(createPayment, /insertSalaryPaymentAllocations/);
  assert.match(createPayment, /referenceType: "SALARY_PAYMENT"/);
  assert.match(createPayment, /await writeCashOutflow\(database, movement\)/);
  assert.match(createPayment, /await writeBankOutflow\(database, movement\)/);
  assert.doesNotMatch(createPayment, /if \(!employee\.isActive\)/);

  assert.match(reversePayment, /referenceType: "SALARY_PAYMENT_REVERSAL"/);
  assert.match(reversePayment, /await writeCashInflow\(database, movement\)/);
  assert.match(reversePayment, /await writeBankInflow\(database, movement\)/);
  assert.match(reversePayment, /markSalaryPaymentReversed/);
});

test("every Employee financial mutation remains behind shared idempotency", async () => {
  const routes = await source("src/modules/employees/employees.routes.ts");

  const advanceCreate = between(routes, "async function handleCreateEmployeeAdvance", "/** Directly recovers");
  const advanceRecover = between(routes, "async function handleRecoverEmployeeAdvance", "/** Lists Payroll Runs");
  const payrollConfirm = between(routes, "async function handleConfirmPayrollRun", "/** Lists Salary Payments");
  const salaryCreate = between(routes, "async function handleCreateSalaryPayment", "/** Loads one Salary Payment");
  const salaryReverse = between(routes, "async function handleReverseSalaryPayment", "/** Builds one documented Employee route");

  assert.match(advanceCreate, /sendIdempotentEmployeeFinancialMutation/);
  assert.match(advanceRecover, /sendIdempotentEmployeeFinancialMutation/);
  assert.match(payrollConfirm, /executeIdempotentMutation/);
  assert.match(salaryCreate, /sendIdempotentEmployeeFinancialMutation/);
  assert.match(salaryReverse, /sendIdempotentEmployeeFinancialMutation/);
  assert.match(routes, /key: request\.headers\["idempotency-key"\]/);
});

test("Employee, Reports, and Dashboard use the same derived financial sources", async () => {
  const [employeesRepository, reportsRepository, dashboardRepository] = await Promise.all([
    source("src/modules/employees/employees.repository.ts"),
    source("src/modules/reports/reports.repository.ts"),
    source("src/modules/dashboard/dashboard.repository.ts"),
  ]);

  for (const text of [employeesRepository, reportsRepository, dashboardRepository]) {
    assert.match(text, /eq\(payrollRuns\.status, "CONFIRMED"\)/);
    assert.match(text, /eq\(salaryPayments\.status, "CONFIRMED"\)/);
    assert.match(text, /isNull\(salaryPayments\.reversalOfPaymentId\)/);
    assert.match(text, /employeeAdvanceRecoveries/);
  }

  assert.match(
    reportsRepository,
    /laborCostAmount = sql<string>`\(coalesce\(sum\(\$\{payrollItems\.netSalary\}\), 0\) \+ coalesce\(sum\(\$\{payrollItems\.advanceRecoveryAmount\}\), 0\)\)::text`/,
  );
});

test("Leave and Advance selectors load beyond the first employee page", async () => {
  const [hooks, leavePage, advancesPage] = await Promise.all([
    source("../web-admin/src/features/employees/hooks/use-employees.ts"),
    source("../web-admin/src/features/employees/pages/leave-page.tsx"),
    source("../web-admin/src/features/employees/pages/advances-page.tsx"),
  ]);

  const allEmployees = between(
    hooks,
    "export function useAllEmployees",
    "/** Loads one employee when its ID is available",
  );
  assert.match(allEmployees, /pageSize = 100/);
  assert.match(allEmployees, /employees\.length < firstPage\.data\.total/);
  assert.match(allEmployees, /loadEmployees\(\{ page, pageSize \}\)/);
  assert.match(leavePage, /useAllEmployees\(\)/);
  assert.match(advancesPage, /useAllEmployees\(\)/);
  assert.doesNotMatch(leavePage, /pageSize: 100/);
  assert.doesNotMatch(advancesPage, /pageSize: 100/);
});

test("Employee mutations invalidate Employee Reports and Dashboard read models", async () => {
  const [employeeHooks, reportHooks] = await Promise.all([
    source("../web-admin/src/features/employees/hooks/use-employees.ts"),
    source("../web-admin/src/features/reports/hooks/use-reports.ts"),
  ]);

  assert.match(reportHooks, /cashBankAll: \["reports", "cash-bank"\] as const/);
  assert.match(reportHooks, /employeeAll: \["reports", "employees"\] as const/);
  assert.match(employeeHooks, /dashboardQueryKeys/);
  assert.match(employeeHooks, /reportQueryKeys/);
  assert.match(employeeHooks, /queryKey: dashboardQueryKeys\.all/);
  assert.match(employeeHooks, /queryKey: reportQueryKeys\.employeeAll/);
  assert.match(employeeHooks, /queryKey: reportQueryKeys\.cashBankAll/);

  for (const hook of [
    "useCreateEmployee",
    "useUpdateEmployee",
    "useCreateAttendanceBulk",
    "useConfirmPayrollRun",
    "useCreateSalaryPayment",
    "useReverseSalaryPayment",
  ]) {
    const start = employeeHooks.indexOf(`export function ${hook}`);
    assert.notEqual(start, -1, `Missing hook: ${hook}`);
    const next = employeeHooks.indexOf("\nexport function ", start + 1);
    const section = employeeHooks.slice(start, next === -1 ? undefined : next);
    assert.match(section, /invalidateEmployeeReadModels\(queryClient/);
  }

  const advanceRefresh = between(
    employeeHooks,
    "async function refreshEmployeeAdvanceAffectedData",
    "interface CreateEmployeeAdvanceVariables",
  );
  assert.match(advanceRefresh, /invalidateEmployeeReadModels\(queryClient, true\)/);
});
