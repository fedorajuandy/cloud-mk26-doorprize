export default function Dashboard() {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div class="space-y-6">
      <h1 class="text-3xl font-bold text-gray-800">Welcome, {currentUser.username || 'Admin'}!</h1>
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <p class="text-gray-600">This is your main dashboard. Navigate to the Wishes tab on the left to view incoming submissions.</p>
      </div>
    </div>
  );
}
