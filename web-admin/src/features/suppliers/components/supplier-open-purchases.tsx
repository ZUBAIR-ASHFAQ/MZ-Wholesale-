import { useSupplierOpenPurchases } from "../hooks/use-suppliers.ts";

interface SupplierOpenPurchasesProps {
  supplierId: string;
}

/** Loads and shows confirmed purchases that still have an outstanding amount. */
export function SupplierOpenPurchases({
  supplierId,
}: SupplierOpenPurchasesProps): React.JSX.Element {
  const openPurchasesQuery = useSupplierOpenPurchases(supplierId, {
    page: 1,
    pageSize: 10,
  });

  if (openPurchasesQuery.isPending) {
    return (
      <section className="management-card customer-open-invoices-card">
        <h2>Open purchases</h2>
        <p>Loading open purchases...</p>
      </section>
    );
  }

  if (openPurchasesQuery.isError || !openPurchasesQuery.data) {
    return (
      <section className="management-card customer-open-invoices-card">
        <h2>Open purchases</h2>
        <p className="error-message">Could not load open purchases.</p>
      </section>
    );
  }

  const purchases = openPurchasesQuery.data.data.items;

  return (
    <section className="management-card customer-open-invoices-card">
      <h2>Open purchases</h2>
      {purchases.length === 0 ? (
        <p>No outstanding purchases are available.</p>
      ) : (
        <div className="table-scroll">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Purchase</th>
                <th>Date</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td>{purchase.purchaseNumber}</td>
                  <td>{purchase.purchaseDate}</td>
                  <td>{purchase.dueAmount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
