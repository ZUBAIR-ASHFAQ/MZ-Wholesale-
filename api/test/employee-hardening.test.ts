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
