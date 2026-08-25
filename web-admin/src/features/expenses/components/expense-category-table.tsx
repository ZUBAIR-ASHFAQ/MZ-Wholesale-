import { Button } from "../../../components/ui/button.tsx";
import { StatusBadge } from "../../../components/ui/status-badge.tsx";
import type { ExpenseCategory } from "../api/expenses.api.ts";

interface ExpenseCategoryTableProps {
  categories: ExpenseCategory[];
  changingCategoryId: string | null;
  onEdit(category: ExpenseCategory): void;
  onToggleActive(category: ExpenseCategory): void;
}

/** Shows expense categories with rename and activate/deactivate actions. */
export function ExpenseCategoryTable({
  categories,
  changingCategoryId,
  onEdit,
  onToggleActive,
}: ExpenseCategoryTableProps): React.JSX.Element {
  if (categories.length === 0) {
    return <p>No expense categories have been created.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="ui-table">
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
