import { Button } from "../../../components/ui/button.tsx";
import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import type { ProductCategory } from "../api/products.api.ts";

interface CategoryTableProps {
  categories: ProductCategory[];
  changingCategoryId: string | null;
  onEdit(category: ProductCategory): void;
  onToggleActive(category: ProductCategory): void;
}

/** Shows category records with simple edit and status actions. */
export function CategoryTable({
  categories,
  changingCategoryId,
  onEdit,
  onToggleActive,
}: CategoryTableProps): React.JSX.Element {
  if (categories.length === 0) {
    return <p>No categories have been created.</p>;
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
          {categories.map((category) => (
            <tr key={category.id}>
              <td>{category.name}</td>
              <td><StatusBadge status={category.isActive ? "ACTIVE" : "INACTIVE"} /></td>
              <td>
                <div className="table-actions">
                  <Button label="Rename" onClick={() => onEdit(category)} />
                  <Button
                    disabled={changingCategoryId === category.id}
                    label={category.isActive ? "Deactivate" : "Activate"}
                    onClick={() => onToggleActive(category)}
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
