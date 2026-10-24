(function configureApp() {
    const savedBackendUrl = window.localStorage.getItem('backendUrl');
    const isLocalFrontend = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const productionBackendUrl = 'https://ai-job-simulator-backend.onrender.com';

    window.APP_CONFIG = {
        backendUrl: (savedBackendUrl || (isLocalFrontend ? 'http://localhost:3000' : productionBackendUrl)).replace(/\/$/, '')
    };
})();
