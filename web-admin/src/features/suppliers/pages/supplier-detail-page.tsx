import { Link } from "@tanstack/react-router";

import { SupplierOpenPurchases } from "../components/supplier-open-purchases.tsx";
import { SupplierRecentPurchases } from "../components/supplier-recent-purchases.tsx";
import { SupplierSummary } from "../components/supplier-summary.tsx";
import { PurchaseReturnTable } from "../../returns/components/purchase-return-table.tsx";
import { usePurchaseReturns } from "../../returns/hooks/use-returns.ts";
import { useSupplier } from "../hooks/use-suppliers.ts";

interface SupplierDetailPageProps {
  supplierId: string;
}

/** Shows one supplier profile, purchase activity, open purchases, and recent returns. */
export function SupplierDetailPage({
  supplierId,
}: SupplierDetailPageProps): React.JSX.Element {
  const supplierQuery = useSupplier(supplierId);
  const purchaseReturnsQuery = usePurchaseReturns({
    supplierId,
    page: 1,
    pageSize: 5,
  });

  if (supplierQuery.isPending) {
    return <p>Loading supplier...</p>;
  }

  if (supplierQuery.isError || !supplierQuery.data) {
    return <p className="error-message">Could not load this supplier.</p>;
  }

  const profile = supplierQuery.data.data;
  const purchaseReturns = purchaseReturnsQuery.data?.data;
  const supplierNames = new Map([
    [profile.supplier.id, `${profile.supplier.code} - ${profile.supplier.name}`],
  ]);

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Supplier Management</p>
          <h1>{profile.supplier.name}</h1>
          <p>Supplier details, payable summary, and purchase activity.</p>
        </div>
        <div className="form-actions">
          <Link
            className="primary-link"
            params={{ supplierId }}
            to="/suppliers/$supplierId/edit"
          >
            Edit supplier
          </Link>
          <Link className="secondary-link" to="/suppliers">
            Back to suppliers
          </Link>
        </div>
      </div>

      <div className="customer-detail-grid">
        <SupplierSummary profile={profile} />
        <SupplierRecentPurchases
          available={profile.recentPurchasesAvailable}
          purchases={profile.recentPurchases}
        />
        <SupplierOpenPurchases supplierId={supplierId} />

        <section className="management-card">
          <div className="page-heading-row">
            <div>
              <h2>Recent purchase returns</h2>
              <p>Confirmed returns linked to this supplier.</p>
            </div>
          </div>

          {purchaseReturnsQuery.isPending ? <p>Loading purchase returns...</p> : null}
          {purchaseReturnsQuery.isError ? (
            <p className="error-message">Could not load supplier purchase returns.</p>
          ) : null}
          {purchaseReturns ? (
            <PurchaseReturnTable
              purchaseReturns={purchaseReturns.items}
              supplierNames={supplierNames}
            />
          ) : null}
        </section>
      </div>
    </section>
  );
}
