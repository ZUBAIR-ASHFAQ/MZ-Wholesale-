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
