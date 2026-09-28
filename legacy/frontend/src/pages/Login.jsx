import { createSignal, onMount, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import api from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const requested = new URLSearchParams(window.location.search).get('returnTo');
  const destination = requested && /^\/(?![\/\\])/.test(requested) ? requested : '/';

  // Form State
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [isLoading, setIsLoading] = createSignal(false);

  // Dynamic Branding State
  const [logoUrl, setLogoUrl] = createSignal('/logo.png');
  const [bgColor, setBgColor] = createSignal('#f3f4f6');

  onMount(async () => {
    // 1. Auto-redirect to dashboard if already logged in
    if (localStorage.getItem('user') && !requested) {
      navigate(destination, { replace: true });
      return;
    }

    // 2. Fetch the branding settings for the login screen
    try {
      const response = await api.get('/settings');
      if (response.data?.data) {
        if (response.data.data.logo_url) setLogoUrl(response.data.data.logo_url);
        if (response.data.data.login_bg_color) setBgColor(response.data.data.login_bg_color);
      }
    } catch (err) {
      console.error('Failed to load branding settings:', err);
    }
  });

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Points to http://localhost:6228/api/login through your api.js service
      const response = await api.post('/login', {
        username: username(),
        password: password()
      });

      if (response.status === 200) {
        // Token is auto-handled by httpOnly cookies via withCredentials in api.js
        // Save the basic user info to check roles later
        localStorage.setItem('user', JSON.stringify(response.data.data));
        navigate(destination, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      class="min-h-screen flex items-center justify-center transition-colors duration-500 px-4"
      style={{ "background-color": bgColor() }}
    >
      <div class="bg-white p-8 rounded-xl shadow-xl w-full max-w-md mx-4 bg-opacity-95 backdrop-blur-sm">
        <div class="flex justify-center mb-6">
          <img src={logoUrl()} alt="Company Logo" class="h-16 w-auto object-contain" />
        </div>

        <h2 class="text-2xl font-bold text-center text-gray-800 mb-8">Admin Portal</h2>

        <Show when={error()}>
          <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 text-sm font-medium text-center">
            <span class="block sm:inline">{error()}</span>
          </div>
        </Show>

        <form onSubmit={handleLogin} class="space-y-6">
          <div>
            <label class="block text-gray-700 text-sm font-bold mb-2" for="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username()}
              onInput={(e) => setUsername(e.target.value)}
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your username"
              required
            />
          </div>

          <div>
            <label class="block text-gray-700 text-sm font-bold mb-2" for="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.target.value)}
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading()}
            class={`w-full text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
              isLoading() ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading() ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
