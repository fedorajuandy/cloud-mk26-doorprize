import { createSignal, onMount, Show } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import api from '../services/api';

export default function MainLayout(props) {
  const navigate = useNavigate();

  const userString = localStorage.getItem('user');
  const currentUser = userString && userString !== 'undefined' ? JSON.parse(userString) : {};
  const isSuperAdmin = currentUser.role_id === 1;

  // Initialize theme from localStorage
  const [isDarkMode, setIsDarkMode] = createSignal(localStorage.getItem('theme') === 'dark');

  // Initialize dynamic logo state
  const [logoUrl, setLogoUrl] = createSignal('/logo.png');

  const toggleTheme = () => {
    const newTheme = !isDarkMode();
    setIsDarkMode(newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
  };

  const handleLogout = async () => {
    try {
      await api.post('/logout');
    } catch (error) {
      console.error('Logout API failed:', error);
    } finally {
      localStorage.removeItem('user');
      navigate('/login', { replace: true });
    }
  };

  // Fetch UI Settings on load
  onMount(async () => {
    try {
      const response = await api.get('/settings');
      if (response.data?.data?.logo_url) {
        setLogoUrl(response.data.data.logo_url);
      }
    } catch (error) {
      console.error('Failed to load system settings:', error);
    }
  });

  return (
    <div class={`min-h-screen flex flex-col md:flex-row transition-colors duration-300 ${isDarkMode() ? 'dark bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-900'}`}>

      <aside class="w-full md:w-64 md:shrink-0 shadow-md flex flex-col border-r transition-colors duration-300 bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-4 shrink-0">
          {/* Dynamically bound logo URL */}
          <img src={logoUrl()} alt="Company Logo" class="h-10 w-auto object-contain" />

          <button onClick={toggleTheme} class="text-xs px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition">
            {isDarkMode() ? '🌙 Dark Mode' : '☀️ Light Mode'}
          </button>
        </div>

        {/* Added overflow-y-auto so the links scroll on small screens */}
        <nav class="flex-1 overflow-y-auto p-4 space-y-2">
          <A href="/" class="block px-4 py-2 rounded-md transition-colors text-gray-700 hover:bg-blue-50 hover:text-blue-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white">
            Wishes
          </A>

          <A href="/phone" class="block px-4 py-2">Phone form ↗</A>
          <A href="/ipad" class="block px-4 py-2">iPad form ↗</A>
          <A href="/display" class="block px-4 py-2">Live display ↗</A>

          <Show when={isSuperAdmin}>
            <A href="/admin-settings" class="block px-4 py-2 rounded-md transition-colors text-gray-700 hover:bg-blue-50 hover:text-blue-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white">
              System Settings
            </A>
          </Show>
        </nav>

        {/* Locked at the bottom with mt-auto and explicit borders */}
        <div class="p-4 border-t border-gray-200 dark:border-gray-700 w-full mt-auto shrink-0">
          <button onClick={handleLogout} class="w-full px-4 py-2 rounded-md transition bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 font-medium">
            Logout
          </button>
        </div>
      </aside>

      <main class="flex-1 min-w-0 p-4 md:p-8 overflow-y-auto">
        {props.children}
      </main>
    </div>
  );
}
