import { Show } from "solid-js";
import AdminLayout, { useAdmin } from "../components/AdminLayout.jsx";
import DoorprizeIntegration from "../features/settings/DoorprizeIntegration.jsx";
function IntegrationPage() {
  const user = useAdmin();
  return (
    <Show
      when={user.role_id === 1}
      fallback={
        <p class="error">
          Doorprize integration is available to Super Admins only.
        </p>
      }
    >
      <DoorprizeIntegration />
    </Show>
  );
}
export default function Integration() {
  return (
    <AdminLayout>
      <IntegrationPage />
    </AdminLayout>
  );
}
