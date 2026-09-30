import { Show } from "solid-js";
import { useAdmin } from "../../components/AdminLayout.jsx";
import CrudTable from "../../components/CrudTable.jsx";
const fields = [
  { key: "unique_id", label: "Unique ID", required: true, max: 255 },
  { key: "full_name", label: "Full name", required: true, max: 255 },
  { key: "nip", label: "NIP", required: true, max: 255 },
  { key: "unit_kerja", label: "Unit kerja", required: true, max: 255 },
  { key: "no_hp", label: "Phone number", max: 20 },
  { key: "email", label: "Email", type: "email", max: 255 },
  { key: "profile_picture", label: "Profile picture URL", max: 16000 },
  { key: "line", label: "Line", max: 255 },
  { key: "status", label: "Registration status", max: 100 },
  { key: "registered_at", label: "Registrasi UTC", max: 64 },
  { key: "verified_at", label: "Verifikasi UTC", max: 64 },
  { key: "sesi", label: "Sesi", type: "number" },
  { key: "babak", label: "Babak", type: "number" },
  { key: "prize", label: "Prize", type: "textarea", max: 16000 },
];
export default function Participants() {
  const user = useAdmin();
  const can = (verb) =>
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
        description="Manage participant details, sessions, rounds, and prize assignments."
        fields={fields}
        columns={[
          "unique_id",
          "full_name",
          "nip",
          "unit_kerja",
          "no_hp",
          "line",
          "status",
          "registered_at",
          "verified_at",
          "email",
          "profile_picture",
          "prize",
          "sesi",
          "babak",
        ]}
        participants
        canPurge={user.role_id === 1}
        canResetResults={user.role_id === 1}
        canSeed={user.role_id === 1}
        canCreate={can("create")}
        canUpdate={can("update")}
        canDelete={can("delete")}
      />
    </Show>
  );
}
