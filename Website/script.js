document.addEventListener('DOMContentLoaded', () => {
    // Countdown Timer logic for 20 days
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 20);

    function updateCountdown() {
        const now = new Date().getTime();
        const distance = targetDate.getTime() - now;

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        document.getElementById('days').style.setProperty('--value', days);
        document.getElementById('hours').style.setProperty('--value', hours);
        document.getElementById('minutes').style.setProperty('--value', minutes);
        document.getElementById('seconds').style.setProperty('--value', seconds);

        if (distance < 0) {
            clearInterval(timerInterval);
        }
    }

    const timerInterval = setInterval(updateCountdown, 1000);
    updateCountdown();

    // Tab Switching for Use Cases
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');

            // Toggle buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Toggle panes
            tabPanes.forEach(pane => {
                pane.classList.remove('active');
                if (pane.id === target) {
                    pane.classList.add('active');
                }
            });
        });
    });

    const form = document.getElementById('feature-form');
    const successMsg = document.getElementById('form-success');

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            // Collect data
            const name = document.getElementById('feature-name').value;
            const desc = document.getElementById('feature-desc').value;

            console.log('Feature Request received:', { name, desc });

            // Visual feedback
            form.style.opacity = '0';
            setTimeout(() => {
                form.classList.add('hidden');
                successMsg.classList.remove('hidden');
                successMsg.style.display = 'block';
                successMsg.style.opacity = '1';
            }, 300);
        });
    }

    // Scroll reveal animation for cards
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.feature-card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'all 0.6s ease-out';
        observer.observe(card);
    });

    // Navbar transparency change on scroll
    window.addEventListener('scroll', () => {
        const nav = document.querySelector('.navbar');
        if (window.scrollY > 50) {
            nav.style.padding = '1rem 0';
            nav.style.background = 'rgba(5, 5, 5, 0.95)';
        } else {
            nav.style.padding = '1.5rem 0';
            nav.style.background = 'rgba(5, 5, 5, 0.8)';
        }
    });
});
