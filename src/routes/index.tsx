import { Show } from "solid-js";
import AdminLayout, { useAdmin } from "../components/AdminLayout";
import CrudTable, { type Field } from "../components/CrudTable";
const fields: Field[] = [
  { key: "full_name", label: "Full name", required: true, max: 255 },
  { key: "nip", label: "NIP", required: true, max: 255 },
  { key: "unit_kerja", label: "Unit kerja", required: true, max: 255 },
  { key: "no_hp", label: "Phone number", max: 20 },
  { key: "babak", label: "Babak", type: "number" },
  { key: "prize", label: "Prize", type: "textarea", max: 16000 },
];
function Participants() {
  const user = useAdmin();
  const can = (verb: string) =>
    user.role_id === 1 || user.permissions.includes(`${verb}_participants`);
  return (
    <Show
      when={can("view")}
      fallback={
        <p class="error">
          Your role does not have access to participants. Contact your
          administrator.
        </p>
      }
    >
      <CrudTable
        resource="participants"
        title="Participants"
        singular="Participant"
        description="Manage participant details, rounds, and prize assignments."
        fields={fields}
        columns={["full_name", "nip", "unit_kerja", "no_hp", "prize", "babak"]}
        participants
        canCreate={can("create")}
        canUpdate={can("update")}
        canDelete={can("delete")}
      />
    </Show>
  );
}
export default function Index() {
  return (
    <AdminLayout>
      <Participants />
    </AdminLayout>
  );
}
