(function configureApp() {
    const savedBackendUrl = window.localStorage.getItem('backendUrl');
    const isLocalFrontend = ['localhost', '127.0.0.1'].includes(window.location.hostname);

    window.APP_CONFIG = {
        backendUrl: (savedBackendUrl || (isLocalFrontend ? 'http://localhost:3000' : window.location.origin)).replace(/\/$/, '')
    };
})();
