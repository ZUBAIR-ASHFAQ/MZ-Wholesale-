/** Central exports let the application and Drizzle Kit load approved tables. */
export {
  businessSettings,
  documentSequences,
  documentTypeEnum,
} from "./business-settings.schema.js";

/** Central Auth exports keep both Module 2 tables in the Drizzle schema. */
export { adminSessions, adminUsers } from "./auth.schema.js";

/** Central Product Management exports keep all Module 3 tables in the Drizzle schema. */
export { brands, productCategories, products, productUnits } from "./product.schema.js";

/** Central Customer Management export keeps the Module 4 table in the Drizzle schema. */
export { customers } from "./customer.schema.js";

/** Central Supplier Management export keeps the Module 5 table in the Drizzle schema. */
export { suppliers } from "./supplier.schema.js";

/** Central Inventory Management exports keep all Module 6 tables and enums in the Drizzle schema. */
export {
  inventoryBalances,
  stockConditionEnum,
  stockCountItems,
  stockCounts,
  stockCountStatusEnum,
  stockDirectionEnum,
  stockMovements,
  stockMovementTypeEnum,
} from "./inventory.schema.js";

/** Central idempotency exports keep duplicate-mutation protection in the Drizzle schema. */
export {
  auditLogs,
  idempotencyRequests,
  idempotencyStatusEnum,
  importJobErrors,
  importJobs,
  importJobStatusEnum,
} from "./system.schema.js";

/** Central Ledger exports keep Module 7 immutable statement tables in the Drizzle schema. */
export { customerLedgerEntries, supplierLedgerEntries } from "./ledger.schema.js";

/** Central Purchase exports keep the Module 9 purchase tables and status enum in the Drizzle schema. */
export { purchaseItems, purchases, purchaseStatusEnum } from "./purchase.schema.js";

/** Central Sales exports keep the Module 10 sales tables and status enum in the Drizzle schema. */
export { salesInvoiceItems, salesInvoices, salesStatusEnum } from "./sales.schema.js";

/** Central Payment exports keep the Module 8 payment foundation in the Drizzle schema. */
export {
  bankAccounts,
  cashAccounts,
  cashBankMovements,
  cashBankTransfers,
  cashReconciliations,
  customerPaymentAllocations,
  customerPaymentSplits,
  customerPayments,
  movementDirectionEnum,
  movementSourceTypeEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  reconciliationStatusEnum,
  supplierPaymentAllocations,
  supplierPaymentSplits,
  supplierPayments,
} from "./payment.schema.js";

/** Central Returns exports keep the Module 11 return tables in Drizzle. */
export {
  purchaseReturnItems,
  purchaseReturns,
  returnStatusEnum,
  salesReturnItems,
  salesReturnRefundModeEnum,
  salesReturns,
  salesReturnStockConditionEnum,
} from "./return.schema.js";

/** Central Expense exports keep the Module 12 tables in the Drizzle schema. */
export { expenseCategories, expenses } from "./expense.schema.js";

/** Central Employee exports keep Module 16 employee/payroll tables in the Drizzle schema. */
export {
  attendanceRecords,
  attendanceStatusEnum,
  employeeAdvanceRecoveries,
  employeeAdvances,
  employeeLeaveStatusEnum,
  employeeLeaves,
  employeeLedgerEntries,
  employees,
  leaveTypes,
  payrollItems,
  payrollRuns,
  payrollStatusEnum,
  salaryPaymentAllocations,
  salaryPaymentSplits,
  salaryPayments,
} from "./employee.schema.js";
