(function () {
  let clerkPromise;

  function loadScript(src, attributes = {}) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') {
          resolve();
        } else {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', () => reject(new Error('Clerk could not be loaded.')), { once: true });
        }
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value));
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', () => reject(new Error('Clerk could not be loaded.')), { once: true });
      document.head.appendChild(script);
    });
  }

  async function initializeClerk() {
    if (clerkPromise) return clerkPromise;

    clerkPromise = (async () => {
      const response = await fetch(`${window.APP_CONFIG.backendUrl}/api/config`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load authentication settings.');
      const config = await response.json();
      if (!config.clerkEnabled || typeof config.clerkPublishableKey !== 'string') {
        throw new Error('Clerk is not configured yet. Set the Clerk publishable and secret keys on the backend.');
      }

      const encodedDomain = config.clerkPublishableKey.split('_')[2];
      if (!encodedDomain) throw new Error('The Clerk publishable key is invalid.');
      const clerkDomain = atob(encodedDomain).replace(/\$$/, '');
      if (!/^[a-z0-9.-]+$/i.test(clerkDomain)) throw new Error('The Clerk publishable key contains an invalid domain.');

      const clerkBaseUrl = `https://${clerkDomain}`;
      await loadScript(`${clerkBaseUrl}/npm/@clerk/ui@1/dist/ui.browser.js`);
      await loadScript(`${clerkBaseUrl}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, {
        'data-clerk-publishable-key': config.clerkPublishableKey
      });
      if (!window.Clerk) throw new Error('The Clerk SDK did not initialize.');
      await window.Clerk.load({
        ui: { ClerkUI: window.__internal_ClerkUICtor }
      });
      return window.Clerk;
    })();

    try {
      return await clerkPromise;
    } catch (error) {
      clerkPromise = null;
      throw error;
    }
  }

  function showAuthError(error) {
    const status = document.getElementById('clerkAuthError');
    if (status) status.textContent = error.message || 'Authentication is unavailable. Please try again.';
  }

  async function mountAuthPage() {
    const page = document.body.dataset.authPage;
    if (!page) return;
    try {
      const clerk = await initializeClerk();
      if (clerk.isSignedIn) {
        window.location.replace('./index.html');
        return;
      }

      const mount = document.getElementById('clerkAuthMount');
      const homeUrl = new URL('./index.html', window.location.href).href;
      const appearance = {
        variables: {
          colorPrimary: '#7c6cff',
          colorText: '#f6f7ff',
          colorTextSecondary: '#aab1d0',
          colorBackground: '#141a38',
          colorInputBackground: '#080b1b',
          colorInputText: '#f6f7ff'
        }
      };
      if (page === 'sign-up') {
        clerk.mountSignUp(mount, {
          signInUrl: './login.html',
          fallbackRedirectUrl: homeUrl,
          appearance
        });
      } else {
        clerk.mountSignIn(mount, {
          signUpUrl: './signup.html',
          fallbackRedirectUrl: homeUrl,
          appearance
        });
      }
      clerk.addListener(({ user }) => {
        if (user) window.location.replace('./index.html');
      });
    } catch (error) {
      console.error('Clerk initialization failed:', error);
      showAuthError(error);
    }
  }

  window.clerkAuth = { initialize: initializeClerk };
  document.addEventListener('DOMContentLoaded', mountAuthPage);
})();
