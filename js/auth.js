document.addEventListener('DOMContentLoaded', function() {
  const loginForm = document.getElementById('loginForm');
  
  if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value.trim();
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      
      // Validation
      if (!username || !password) {
        showMessage('loginMessage', 'Please enter username and password', true);
        return;
      }
      
      // Show loading state
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="spinner"></span> Logging in...';
      submitBtn.disabled = true;
      
      try {
        const result = await login(username, password);
        
        if (result.success) {
          // Success - redirect to dashboard
          showMessage('loginMessage', 'Login successful! Redirecting...', false);
          setTimeout(() => {
            window.location.href = 'dashboard.html'; // Change to your dashboard page
          }, 1000);
        } else {
          showMessage('loginMessage', result.message || 'Login failed', true);
        }
      } catch (error) {
        console.error('Login error:', error);
        showMessage('loginMessage', error.message || 'Login error occurred', true);
      } finally {
        // Reset button
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  // Clear message on input focus
  ['username', 'password'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('focus', function() {
        showMessage('loginMessage', '', false);
      });
    }
  });
});
