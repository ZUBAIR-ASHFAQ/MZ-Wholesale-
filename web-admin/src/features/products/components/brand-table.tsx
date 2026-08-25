import { Button } from "../../../components/ui/button.tsx";
import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import type { Brand } from "../api/products.api.ts";

interface BrandTableProps {
  brands: Brand[];
  changingBrandId: string | null;
  onEdit(brand: Brand): void;
  onToggleActive(brand: Brand): void;
}

/** Shows brand records with simple edit and status actions. */
export function BrandTable({
  brands,
  changingBrandId,
  onEdit,
  onToggleActive,
}: BrandTableProps): React.JSX.Element {
  if (brands.length === 0) {
    return <p>No brands have been created.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table product-settings-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {brands.map((brand) => (
            <tr key={brand.id}>
              <td>{brand.name}</td>
              <td><StatusBadge status={brand.isActive ? "ACTIVE" : "INACTIVE"} /></td>
              <td>
                <div className="table-actions">
                  <Button label="Rename" onClick={() => onEdit(brand)} />
                  <Button
                    disabled={changingBrandId === brand.id}
                    label={brand.isActive ? "Deactivate" : "Activate"}
                    onClick={() => onToggleActive(brand)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
