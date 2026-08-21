import { requestApi } from "../../../lib/api-client.ts";
import type { ApiSuccess } from "../../../lib/api-types.ts";

/** Shared date-range filters used by report endpoints. */
export interface ReportDateRangeFilters {
  startDate: string;
  endDate: string;
}

/** Filters accepted by GET /reports/sales. */
export interface SalesReportFilters extends ReportDateRangeFilters {
  customerId?: string;
  productId?: string;
}

/** One Sales Report detail row. */
export interface SalesReportRow {
  documentType: "SALE" | "RETURN";
  documentId: string;
  documentNumber: string;
  documentDate: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  productId: string;
  productSku: string;
  productName: string;
  unitName: string;
  quantity: string;
  baseQuantity: string;
  unitPrice: string;
  amount: string;
}

/** Sales Report totals and matching detail rows. */
export interface SalesReport {
  totals: {
    salesAmount: string;
    returnAmount: string;
    netSalesAmount: string;
  };
  rows: SalesReportRow[];
}

/** Filters accepted by GET /reports/purchases. */
export interface PurchasesReportFilters extends ReportDateRangeFilters {
  supplierId?: string;
  productId?: string;
}

/** One Purchase Report detail row. */
export interface PurchasesReportRow {
  documentType: "PURCHASE" | "RETURN";
  documentId: string;
  documentNumber: string;
  documentDate: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  productId: string;
  productSku: string;
  productName: string;
  unitName: string;
  quantity: string;
  baseQuantity: string;
  unitCost: string;
  amount: string;
}

/** Purchase Report totals and matching detail rows. */
export interface PurchasesReport {
  totals: {
    purchasesAmount: string;
    returnAmount: string;
    netPurchasesAmount: string;
  };
  rows: PurchasesReportRow[];
}

/** Filters accepted by GET /reports/inventory. */
export interface InventoryReportFilters extends ReportDateRangeFilters {
  productId?: string;
  lowStock?: boolean;
}

/** One current-stock row returned by the Inventory Report. */
export interface InventoryReportStockRow {
  productId: string;
  productSku: string;
  productName: string;
  categoryName: string;
  brandName: string | null;
  baseUnitName: string;
  reorderLevel: string;
  sellableQuantity: string;
  damagedQuantity: string;
  expiredQuantity: string;
  weightedAverageCost: string;
  isLowStock: boolean;
}

/** One immutable movement returned by the Inventory Report. */
export interface InventoryReportMovement {
  movementId: string;
  productId: string;
  productSku: string;
  productName: string;
  occurredAt: string;
  movementType: string;
  stockCondition: string;
  direction: string;
  quantity: string;
  unitCost: string;
  allocatedExtraCost: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reason: string | null;
  notes: string | null;
}

/** Current stock and selected movement history. */
export interface InventoryReport {
  stock: InventoryReportStockRow[];
  movements: InventoryReportMovement[];
}

/** Filters accepted by GET /reports/inventory-valuation. */
export interface InventoryValuationReportFilters {
  search?: string;
  categoryId?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

/** One product row returned by the Inventory Valuation Report. */
export interface InventoryValuationReportRow {
  productId: string;
  productSku: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  isActive: boolean;
  sellableQuantity: string;
  damagedQuantity: string;
  expiredQuantity: string;
  totalQuantity: string;
  weightedAverageCost: string;
  sellableValue: string;
  damagedValue: string;
  expiredValue: string;
  totalValue: string;
}

/** Full filtered quantity and valuation totals for the Inventory Valuation Report. */
export interface InventoryValuationReportTotals {
  sellableQuantity: string;
  damagedQuantity: string;
  expiredQuantity: string;
  totalQuantity: string;
  sellableValue: string;
  damagedValue: string;
  expiredValue: string;
  totalValue: string;
}

/** One paginated Inventory Valuation Report response. */
export interface InventoryValuationReport {
  items: InventoryValuationReportRow[];
  totals: InventoryValuationReportTotals;
  page: number;
  pageSize: number;
  total: number;
}

/** Filters accepted by GET /reports/customers/aging. */
export interface CustomerAgingReportFilters {
  asOfDate: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** One customer row returned by the Customer Aging Report. */
export interface CustomerAgingReportRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  phone: string | null;
  bucket0To30: string;
  bucket31To60: string;
  bucket61To90: string;
  bucket90Plus: string;
  totalOutstanding: string;
}

/** Full filtered aging totals, not only the current page. */
export interface CustomerAgingReportTotals {
  bucket0To30: string;
  bucket31To60: string;
  bucket61To90: string;
  bucket90Plus: string;
  totalOutstanding: string;
}

/** One paginated Customer Aging Report response. */
export interface CustomerAgingReport {
  items: CustomerAgingReportRow[];
  totals: CustomerAgingReportTotals;
  page: number;
  pageSize: number;
  total: number;
}

/** Filters accepted by GET /reports/suppliers/aging. */
export interface SupplierAgingReportFilters {
  asOfDate: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** One supplier row returned by the Supplier Aging Report. */
export interface SupplierAgingReportRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  phone: string | null;
  bucket0To30: string;
  bucket31To60: string;
  bucket61To90: string;
  bucket90Plus: string;
  totalPayable: string;
}

/** Full filtered aging totals, not only the current page. */
export interface SupplierAgingReportTotals {
  bucket0To30: string;
  bucket31To60: string;
  bucket61To90: string;
  bucket90Plus: string;
  totalPayable: string;
}

/** One paginated Supplier Aging Report response. */
export interface SupplierAgingReport {
  items: SupplierAgingReportRow[];
  totals: SupplierAgingReportTotals;
  page: number;
  pageSize: number;
  total: number;
}

/** Filters accepted by GET /reports/customers/outstanding. */
export interface CustomerOutstandingReportFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

/** One customer with a positive outstanding balance. */
export interface CustomerOutstandingReportRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  phone: string | null;
  outstandingAmount: string;
}

/** One paginated Customer Outstanding Report result. */
export interface CustomerOutstandingReport {
  items: CustomerOutstandingReportRow[];
  page: number;
  pageSize: number;
  total: number;
}

/** Filters accepted by GET /reports/suppliers/payable. */
export interface SupplierPayableReportFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

/** One supplier with a positive payable balance. */
export interface SupplierPayableReportRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  phone: string | null;
  payableAmount: string;
}

/** One paginated Supplier Payable Report result. */
export interface SupplierPayableReport {
  items: SupplierPayableReportRow[];
  page: number;
  pageSize: number;
  total: number;
}

/** Filters accepted by GET /reports/cash-bank. */
export interface CashBankReportFilters extends ReportDateRangeFilters {
  accountId?: string;
}

/** One immutable cash/bank movement returned by the report. */
export interface CashBankReportMovement {
  movementId: string;
  businessDate: string;
  occurredAt: string;
  direction: "INFLOW" | "OUTFLOW";
  sourceType: string;
  sourceId: string | null;
  amount: string;
  documentNumber: string | null;
  description: string | null;
}

/** One cash or bank account summary with opening and closing balances. */
export interface CashBankReportAccount {
  accountId: string;
  accountType: "CASH" | "BANK";
  accountName: string;
  accountReference: string | null;
  openingBalance: string;
  inflowAmount: string;
  outflowAmount: string;
  closingBalance: string;
  movements: CashBankReportMovement[];
}

/** Cash/Bank Report result. */
export interface CashBankReport {
  accounts: CashBankReportAccount[];
}

/** Filters accepted by GET /reports/expenses. */
export interface ExpenseReportFilters extends ReportDateRangeFilters {
  categoryId?: string;
}

/** One immutable expense or reversal row. */
export interface ExpenseReportRow {
  documentType: "EXPENSE" | "REVERSAL";
  expenseId: string;
  expenseNumber: string;
  documentDate: string;
  categoryId: string;
  categoryName: string;
  paymentMethod: "CASH" | "BANK_TRANSFER";
  accountId: string;
  accountName: string;
  amount: string;
  note: string | null;
  receiptUrl: string | null;
  reversalOfExpenseId: string | null;
  reversalReason: string | null;
}

/** Expense Report totals and matching immutable rows. */
export interface ExpenseReport {
  totals: {
    expenseAmount: string;
    reversalAmount: string;
    netExpenseAmount: string;
  };
  rows: ExpenseReportRow[];
}

/** Filters accepted by GET /reports/profit-summary. */
export type ProfitSummaryReportFilters = ReportDateRangeFilters;

/** Estimated profit figures returned by the Profit Summary Report. */
export interface ProfitSummaryReport {
  salesAmount: string;
  salesReturnAmount: string;
  netSalesAmount: string;
  costOfGoodsSoldAmount: string;
  returnedCostAmount: string;
  netCostAmount: string;
  grossProfitAmount: string;
  expenseAmount: string;
  expenseReversalAmount: string;
  netExpenseAmount: string;
  estimatedProfitAmount: string;
}

/** Filters accepted by GET /reports/product-profit. */
export interface ProductProfitReportFilters extends ReportDateRangeFilters {
  productId?: string;
  page?: number;
  pageSize?: number;
}

/** One product-level estimated-profit row. */
export interface ProductProfitReportRow {
  productId: string;
  productSku: string;
  productName: string;
  soldBaseQuantity: string;
  returnedBaseQuantity: string;
  netBaseQuantity: string;
  salesAmount: string;
  returnAmount: string;
  netSalesAmount: string;
  costOfGoodsSoldAmount: string;
  returnedCostAmount: string;
  netCostAmount: string;
  estimatedProfitAmount: string;
}

/** One paginated Product Profit Report result. */
export interface ProductProfitReport {
  items: ProductProfitReportRow[];
  total: number;
  page: number;
  pageSize: number;
}


/** Filters accepted by GET /reports/employees/register. */
export interface EmployeeRegisterReportFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

/** One row in the Employee Register. */
export interface EmployeeRegisterReportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  phone: string | null;
  jobTitle: string | null;
  department: string | null;
  employmentType: string;
  joinDate: string;
  leaveDate: string | null;
  isActive: boolean;
  baseMonthlySalary: string;
  salaryPayable: string;
  advanceOutstanding: string;
}

/** Paginated Employee Register response. */
export interface EmployeeRegisterReport {
  items: EmployeeRegisterReportRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Filters accepted by GET /reports/employees/attendance. */
export type AttendanceSummaryReportFilters = ReportDateRangeFilters;

/** One employee's Attendance Summary counts. */
export interface AttendanceSummaryReportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
  holidayDays: number;
  weeklyOffDays: number;
  workedHours: string;
}

/** Attendance Summary response for one date range. */
export interface AttendanceSummaryReport {
  startDate: string;
  endDate: string;
  rows: AttendanceSummaryReportRow[];
}

/** Filters accepted by GET /reports/employees/payroll. */
export type PayrollRegisterReportFilters = ReportDateRangeFilters;

/** One immutable confirmed Payroll Item in the Payroll Register. */
export interface PayrollRegisterReportRow {
  payrollRunId: string;
  payrollItemId: string;
  payrollNumber: string;
  periodStart: string;
  periodEnd: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  jobTitle: string | null;
  baseSalary: string;
  grossSalary: string;
  attendanceDeduction: string;
  additionsAmount: string;
  deductionsAmount: string;
  advanceRecoveryAmount: string;
  netSalary: string;
}

/** Payroll Register response for one date range. */
export interface PayrollRegisterReport {
  startDate: string;
  endDate: string;
  rows: PayrollRegisterReportRow[];
}

/** Filters accepted by GET /reports/employees/salary-payable. */
export interface SalaryPayableReportFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

/** One employee's current Salary Payable. */
export interface SalaryPayableReportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  jobTitle: string | null;
  salaryDueAmount: string;
  salaryPaidAmount: string;
  salaryPayable: string;
}

/** Paginated current Salary Payable response. */
export interface SalaryPayableReport {
  items: SalaryPayableReportRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Filters accepted by GET /reports/employees/advance-outstanding. */
export interface EmployeeAdvanceOutstandingReportFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

/** One employee's current Employee Advance Outstanding. */
export interface EmployeeAdvanceOutstandingReportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  advanceOriginalAmount: string;
  advanceRecoveredAmount: string;
  advanceOutstanding: string;
}

/** Paginated current Employee Advance Outstanding response. */
export interface EmployeeAdvanceOutstandingReport {
  items: EmployeeAdvanceOutstandingReportRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Filters accepted by GET /reports/employees/labor-cost. */
export type LaborCostSummaryReportFilters = ReportDateRangeFilters;

/** One confirmed Payroll Run in the Labor Cost Summary. */
export interface LaborCostSummaryReportRow {
  payrollRunId: string;
  payrollNumber: string;
  periodStart: string;
  periodEnd: string;
  employeeCount: number;
  netSalaryAmount: string;
  advanceRecoveryAmount: string;
  laborCostAmount: string;
}

/** Labor Cost Summary response for one date range. */
export interface LaborCostSummaryReport {
  startDate: string;
  endDate: string;
  payrollRunCount: number;
  employeeCount: number;
  netSalaryAmount: string;
  advanceRecoveryAmount: string;
  laborCostAmount: string;
  rows: LaborCostSummaryReportRow[];
}

/** Adds one optional text value to a report query string. */
function addTextFilter(
  params: URLSearchParams,
  name: string,
  value: string | undefined,
): void {
  const trimmedValue = value?.trim();

  if (trimmedValue) {
    params.set(name, trimmedValue);
  }
}

/** Adds one required date range to a report query string. */
function addDateRange(
  params: URLSearchParams,
  filters: ReportDateRangeFilters,
): void {
  params.set("startDate", filters.startDate);
  params.set("endDate", filters.endDate);
}

/** Adds optional pagination values to a report query string. */
function addPagination(
  params: URLSearchParams,
  filters: { page?: number; pageSize?: number },
): void {
  if (filters.page !== undefined) {
    params.set("page", String(filters.page));
  }

  if (filters.pageSize !== undefined) {
    params.set("pageSize", String(filters.pageSize));
  }
}

/** Converts URL parameters into the query-string suffix used by report GET calls. */
function createQueryString(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Builds the approved Sales Report query string. */
function buildSalesReportQuery(filters: SalesReportFilters): string {
  const params = new URLSearchParams();
  addDateRange(params, filters);
  addTextFilter(params, "customerId", filters.customerId);
  addTextFilter(params, "productId", filters.productId);
  return createQueryString(params);
}

/** Builds the approved Purchase Report query string. */
function buildPurchasesReportQuery(filters: PurchasesReportFilters): string {
  const params = new URLSearchParams();
  addDateRange(params, filters);
  addTextFilter(params, "supplierId", filters.supplierId);
  addTextFilter(params, "productId", filters.productId);
  return createQueryString(params);
}

/** Builds the approved Inventory Report query string. */
function buildInventoryReportQuery(filters: InventoryReportFilters): string {
  const params = new URLSearchParams();
  addDateRange(params, filters);
  addTextFilter(params, "productId", filters.productId);

  if (filters.lowStock !== undefined) {
    params.set("lowStock", String(filters.lowStock));
  }

  return createQueryString(params);
}

/** Builds the approved Inventory Valuation Report query string. */
function buildInventoryValuationReportQuery(
  filters: InventoryValuationReportFilters,
): string {
  const params = new URLSearchParams();
  addTextFilter(params, "search", filters.search);
  addTextFilter(params, "categoryId", filters.categoryId);

  if (filters.active !== undefined) {
    params.set("active", String(filters.active));
  }

  addPagination(params, filters);
  return createQueryString(params);
}

/** Builds the approved Customer Aging Report query string. */
function buildCustomerAgingReportQuery(
  filters: CustomerAgingReportFilters,
): string {
  const params = new URLSearchParams();
  params.set("asOfDate", filters.asOfDate);
  addTextFilter(params, "search", filters.search);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Builds the approved Supplier Aging Report query string. */
function buildSupplierAgingReportQuery(
  filters: SupplierAgingReportFilters,
): string {
  const params = new URLSearchParams();
  params.set("asOfDate", filters.asOfDate);
  addTextFilter(params, "search", filters.search);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Builds the approved Customer Outstanding Report query string. */
function buildCustomerOutstandingReportQuery(
  filters: CustomerOutstandingReportFilters,
): string {
  const params = new URLSearchParams();
  addTextFilter(params, "search", filters.search);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Builds the approved Supplier Payable Report query string. */
function buildSupplierPayableReportQuery(
  filters: SupplierPayableReportFilters,
): string {
  const params = new URLSearchParams();
  addTextFilter(params, "search", filters.search);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Builds the approved Cash/Bank Report query string. */
function buildCashBankReportQuery(filters: CashBankReportFilters): string {
  const params = new URLSearchParams();
  addDateRange(params, filters);
  addTextFilter(params, "accountId", filters.accountId);
  return createQueryString(params);
}

/** Builds the approved Expense Report query string. */
function buildExpenseReportQuery(filters: ExpenseReportFilters): string {
  const params = new URLSearchParams();
  addDateRange(params, filters);
  addTextFilter(params, "categoryId", filters.categoryId);
  return createQueryString(params);
}

/** Builds the approved Profit Summary Report query string. */
function buildProfitSummaryReportQuery(
  filters: ProfitSummaryReportFilters,
): string {
  const params = new URLSearchParams();
  addDateRange(params, filters);
  return createQueryString(params);
}

/** Builds the approved Product Profit Report query string. */
function buildProductProfitReportQuery(
  filters: ProductProfitReportFilters,
): string {
  const params = new URLSearchParams();
  addDateRange(params, filters);
  addTextFilter(params, "productId", filters.productId);
  addPagination(params, filters);
  return createQueryString(params);
}


/** Builds a search/pagination query used by current Employee balance reports. */
function buildEmployeeSearchReportQuery(
  filters: { search?: string; page?: number; pageSize?: number },
): string {
  const params = new URLSearchParams();
  addTextFilter(params, "search", filters.search);
  addPagination(params, filters);
  return createQueryString(params);
}

/** Builds one Employee date-range report query. */
function buildEmployeeDateReportQuery(filters: ReportDateRangeFilters): string {
  const params = new URLSearchParams();
  addDateRange(params, filters);
  return createQueryString(params);
}

/** Loads the read-only Sales Report. */
export function loadSalesReport(
  filters: SalesReportFilters,
): Promise<ApiSuccess<SalesReport>> {
  return requestApi<ApiSuccess<SalesReport>>(
    `/reports/sales${buildSalesReportQuery(filters)}`,
  );
}

/** Loads the read-only Purchase Report. */
export function loadPurchasesReport(
  filters: PurchasesReportFilters,
): Promise<ApiSuccess<PurchasesReport>> {
  return requestApi<ApiSuccess<PurchasesReport>>(
    `/reports/purchases${buildPurchasesReportQuery(filters)}`,
  );
}

/** Loads the read-only Inventory Report. */
export function loadInventoryReport(
  filters: InventoryReportFilters,
): Promise<ApiSuccess<InventoryReport>> {
  return requestApi<ApiSuccess<InventoryReport>>(
    `/reports/inventory${buildInventoryReportQuery(filters)}`,
  );
}

/** Loads the paginated read-only Inventory Valuation Report. */
export function loadInventoryValuationReport(
  filters: InventoryValuationReportFilters = {},
): Promise<ApiSuccess<InventoryValuationReport>> {
  return requestApi<ApiSuccess<InventoryValuationReport>>(
    `/reports/inventory-valuation${buildInventoryValuationReportQuery(filters)}`,
  );
}

/** Loads the paginated read-only Customer Aging Report. */
export function loadCustomerAgingReport(
  filters: CustomerAgingReportFilters,
): Promise<ApiSuccess<CustomerAgingReport>> {
  return requestApi<ApiSuccess<CustomerAgingReport>>(
    `/reports/customers/aging${buildCustomerAgingReportQuery(filters)}`,
  );
}

/** Loads the paginated read-only Supplier Aging Report. */
export function loadSupplierAgingReport(
  filters: SupplierAgingReportFilters,
): Promise<ApiSuccess<SupplierAgingReport>> {
  return requestApi<ApiSuccess<SupplierAgingReport>>(
    `/reports/suppliers/aging${buildSupplierAgingReportQuery(filters)}`,
  );
}

/** Loads the paginated Customer Outstanding Report. */
export function loadCustomerOutstandingReport(
  filters: CustomerOutstandingReportFilters = {},
): Promise<ApiSuccess<CustomerOutstandingReport>> {
  return requestApi<ApiSuccess<CustomerOutstandingReport>>(
    `/reports/customers/outstanding${buildCustomerOutstandingReportQuery(filters)}`,
  );
}

/** Loads the paginated Supplier Payable Report. */
export function loadSupplierPayableReport(
  filters: SupplierPayableReportFilters = {},
): Promise<ApiSuccess<SupplierPayableReport>> {
  return requestApi<ApiSuccess<SupplierPayableReport>>(
    `/reports/suppliers/payable${buildSupplierPayableReportQuery(filters)}`,
  );
}

/** Loads the read-only Cash/Bank Report. */
export function loadCashBankReport(
  filters: CashBankReportFilters,
): Promise<ApiSuccess<CashBankReport>> {
  return requestApi<ApiSuccess<CashBankReport>>(
    `/reports/cash-bank${buildCashBankReportQuery(filters)}`,
  );
}

/** Loads the read-only Expense Report. */
export function loadExpenseReport(
  filters: ExpenseReportFilters,
): Promise<ApiSuccess<ExpenseReport>> {
  return requestApi<ApiSuccess<ExpenseReport>>(
    `/reports/expenses${buildExpenseReportQuery(filters)}`,
  );
}

/** Loads the read-only estimated Profit Summary Report. */
export function loadProfitSummaryReport(
  filters: ProfitSummaryReportFilters,
): Promise<ApiSuccess<ProfitSummaryReport>> {
  return requestApi<ApiSuccess<ProfitSummaryReport>>(
    `/reports/profit-summary${buildProfitSummaryReportQuery(filters)}`,
  );
}

/** Loads the paginated Product Profit Report. */
export function loadProductProfitReport(
  filters: ProductProfitReportFilters,
): Promise<ApiSuccess<ProductProfitReport>> {
  return requestApi<ApiSuccess<ProductProfitReport>>(
    `/reports/product-profit${buildProductProfitReportQuery(filters)}`,
  );
}

/** Loads the paginated Employee Register. */
export function loadEmployeeRegisterReport(
  filters: EmployeeRegisterReportFilters = {},
): Promise<ApiSuccess<EmployeeRegisterReport>> {
  return requestApi<ApiSuccess<EmployeeRegisterReport>>(
    `/reports/employees/register${buildEmployeeSearchReportQuery(filters)}`,
  );
}

/** Loads the Employee Attendance Summary. */
export function loadAttendanceSummaryReport(
  filters: AttendanceSummaryReportFilters,
): Promise<ApiSuccess<AttendanceSummaryReport>> {
  return requestApi<ApiSuccess<AttendanceSummaryReport>>(
    `/reports/employees/attendance${buildEmployeeDateReportQuery(filters)}`,
  );
}

/** Loads the confirmed Employee Payroll Register. */
export function loadPayrollRegisterReport(
  filters: PayrollRegisterReportFilters,
): Promise<ApiSuccess<PayrollRegisterReport>> {
  return requestApi<ApiSuccess<PayrollRegisterReport>>(
    `/reports/employees/payroll${buildEmployeeDateReportQuery(filters)}`,
  );
}

/** Loads the paginated current Employee Salary Payable report. */
export function loadSalaryPayableReport(
  filters: SalaryPayableReportFilters = {},
): Promise<ApiSuccess<SalaryPayableReport>> {
  return requestApi<ApiSuccess<SalaryPayableReport>>(
    `/reports/employees/salary-payable${buildEmployeeSearchReportQuery(filters)}`,
  );
}

/** Loads the paginated current Employee Advance Outstanding report. */
export function loadEmployeeAdvanceOutstandingReport(
  filters: EmployeeAdvanceOutstandingReportFilters = {},
): Promise<ApiSuccess<EmployeeAdvanceOutstandingReport>> {
  return requestApi<ApiSuccess<EmployeeAdvanceOutstandingReport>>(
    `/reports/employees/advance-outstanding${buildEmployeeSearchReportQuery(filters)}`,
  );
}

/** Loads the confirmed Employee Labor Cost Summary. */
export function loadLaborCostSummaryReport(
  filters: LaborCostSummaryReportFilters,
): Promise<ApiSuccess<LaborCostSummaryReport>> {
  return requestApi<ApiSuccess<LaborCostSummaryReport>>(
    `/reports/employees/labor-cost${buildEmployeeDateReportQuery(filters)}`,
  );
}
