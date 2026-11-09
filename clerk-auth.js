function loadClerkScript(src, publishableKey) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    if (publishableKey) script.dataset.clerkPublishableKey = publishableKey;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Unable to load Clerk authentication. Check your connection and try again.'));
    document.head.appendChild(script);
  });
}

async function initializeClerk() {
  const backendUrl = window.APP_CONFIG && window.APP_CONFIG.backendUrl;
  if (!backendUrl) throw new Error('The authentication server is not configured.');

  const response = await fetch(`${backendUrl}/api/auth/config`);
  if (!response.ok) throw new Error('Unable to load authentication configuration.');

  const config = await response.json();
  if (!config.configured || !config.publishableKey) return null;

  let clerkDomain;
  try {
    clerkDomain = atob(config.publishableKey.split('_')[2]).slice(0, -1);
  } catch (error) {
    throw new Error('The Clerk publishable key is invalid.');
  }
  if (!clerkDomain) throw new Error('The Clerk publishable key is invalid.');

  await loadClerkScript(`https://${clerkDomain}/npm/@clerk/ui@1/dist/ui.browser.js`);
  await loadClerkScript(
    `https://${clerkDomain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,
    config.publishableKey
  );

  const clerk = window.Clerk;
  if (!clerk) throw new Error('The Clerk browser SDK did not initialize.');
  await clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
  return clerk;
}

window.clerkReady = initializeClerk();

window.clerkAppearance = {
  variables: {
    colorPrimary: '#7c6cff',
    colorBackground: '#111630',
    colorText: '#f6f7ff',
    colorTextSecondary: '#aab1d0',
    colorInputBackground: 'rgba(255, 255, 255, 0.06)',
    colorInputText: '#f6f7ff',
    colorNeutral: '#aab1d0',
    colorDanger: '#fb7185',
    borderRadius: '12px',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  elements: {
    rootBox: 'clerk-root-box',
    cardBox: 'clerk-card-box',
    card: 'clerk-card',
    headerTitle: 'clerk-header-title',
    headerSubtitle: 'clerk-header-subtitle',
    socialButtonsBlockButton: 'clerk-social-button',
    formFieldLabel: 'clerk-form-label',
    formFieldInput: 'clerk-form-input',
    formButtonPrimary: 'clerk-form-submit',
    footerActionLink: 'clerk-footer-link',
    dividerLine: 'clerk-divider-line',
    dividerText: 'clerk-divider-text',
    footer: 'clerk-footer'
  },
  options: {
    socialButtonsVariant: 'blockButton',
    socialButtonsPlacement: 'top',
    showOptionalFields: false
  }
};

window.mountClerkAuthPage = async function mountClerkAuthPage() {
  const status = document.getElementById('auth-status');
  const mode = document.body.dataset.authMode;
  try {
    const clerk = await window.clerkReady;
    if (!clerk) {
      status.textContent = 'Authentication is temporarily unavailable. The site administrator needs to configure Clerk on the backend.';
      return;
    }

    if (clerk.isSignedIn) {
      window.location.replace('./simulator.html');
      return;
    }

    const simulatorUrl = new URL('./simulator.html', window.location.href).href;
    const mountPoint = document.getElementById('clerk-auth-widget');
    if (mode === 'sign-up') {
      clerk.mountSignUp(mountPoint, {
        signInUrl: './login.html',
        forceRedirectUrl: simulatorUrl,
        fallbackRedirectUrl: simulatorUrl,
        appearance: window.clerkAppearance
      });
    } else {
      clerk.mountSignIn(mountPoint, {
        signUpUrl: './signup.html',
        forceRedirectUrl: simulatorUrl,
        fallbackRedirectUrl: simulatorUrl,
        appearance: window.clerkAppearance
      });
    }
    status.textContent = '';
  } catch (error) {
    console.error('Clerk authentication could not be loaded:', error);
    status.textContent = error.message || 'Unable to load authentication. Please try again.';
  }
};
