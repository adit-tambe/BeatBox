// auth.js — Login & Register logic
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('loginError');
            errEl.style.display = 'none';
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (data.success) {
                    localStorage.setItem('beatbox_user', JSON.stringify(data.user));
                    window.location.href = ['owner', 'admin'].includes(data.user.role) ? 'app.html#admin' : 'app.html#discover';
                } else {
                    errEl.textContent = data.error || 'Login failed';
                    errEl.style.display = 'block';
                }
            } catch {
                errEl.textContent = 'Network error. Please try again.';
                errEl.style.display = 'block';
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = document.getElementById('registerError');
            const sucEl = document.getElementById('registerSuccess');
            errEl.style.display = 'none';
            sucEl.style.display = 'none';
            const name = document.getElementById('regName').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const password = document.getElementById('regPassword').value;
            const date_of_birth = document.getElementById('regDob').value || null;
            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password, date_of_birth })
                });
                const data = await res.json();
                if (data.success) {
                    sucEl.textContent = 'Account created! Redirecting…';
                    sucEl.style.display = 'block';
                    localStorage.setItem('beatbox_user', JSON.stringify(data.user));
                    setTimeout(() => { window.location.href = 'app.html#discover'; }, 800);
                } else {
                    errEl.textContent = data.error || 'Registration failed';
                    errEl.style.display = 'block';
                }
            } catch {
                errEl.textContent = 'Network error. Please try again.';
                errEl.style.display = 'block';
            }
        });
    }
});
