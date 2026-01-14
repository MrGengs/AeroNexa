// ===== Company Profile JavaScript =====

// Remove Splash Screen
function removeSplashScreen() {
    setTimeout(() => {
        const splash = document.getElementById('splashScreen');
        if (splash) {
            splash.style.display = 'none';
        }
    }, 2500);
}

// Call on page load
document.addEventListener('DOMContentLoaded', () => {
    removeSplashScreen();
});

// Navigation Toggle for Mobile
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');
const navMenuOverlay = document.getElementById('navMenuOverlay');
const navLinks = document.querySelectorAll('.nav-link');

function toggleMobileMenu() {
    const isActive = navMenu.classList.contains('active');
    navMenu.classList.toggle('active');
    navToggle.classList.toggle('active');
    
    // Toggle blur effect on body content
    if (!isActive) {
        document.body.classList.add('menu-active');
    } else {
        document.body.classList.remove('menu-active');
    }
}

function closeMobileMenu() {
    navMenu.classList.remove('active');
    navToggle.classList.remove('active');
    document.body.classList.remove('menu-active');
}

if (navToggle) {
    navToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMobileMenu();
    });
}

// Close mobile menu when clicking on blurred background
document.addEventListener('click', (e) => {
    if (navMenu && navMenu.classList.contains('active')) {
        // Close if clicking outside menu and toggle button
        if (!navMenu.contains(e.target) && !navToggle.contains(e.target)) {
            // Check if click is on blurred background (not on header)
            const companyNav = document.querySelector('.company-nav');
            if (companyNav && !companyNav.contains(e.target)) {
                closeMobileMenu();
            }
        }
    }
});

// Close mobile menu when clicking on a link
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        closeMobileMenu();
    });
});

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    if (navMenu && navMenu.classList.contains('active')) {
        if (!navMenu.contains(e.target) && !navToggle.contains(e.target)) {
            closeMobileMenu();
        }
    }
});

// Close mobile menu on scroll
window.addEventListener('scroll', () => {
    if (navMenu && navMenu.classList.contains('active')) {
        closeMobileMenu();
    }
});

// Active navigation link on scroll
const sections = document.querySelectorAll('section[id]');

function activateNavLink() {
    const scrollY = window.pageYOffset;

    sections.forEach(section => {
        const sectionHeight = section.offsetHeight;
        const sectionTop = section.offsetTop - 100;
        const sectionId = section.getAttribute('id');
        const navLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);

        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
            navLinks.forEach(link => link.classList.remove('active'));
            if (navLink) {
                navLink.classList.add('active');
            }
        }
    });
}

window.addEventListener('scroll', activateNavLink);

// Navbar background on scroll
const companyNav = document.querySelector('.company-nav');

window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        companyNav.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.12)';
    } else {
        companyNav.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
    }
});

// Price conversion to Rupiah
function updatePriceInRupiah() {
    const priceIDR = document.getElementById('priceIDR');
    const priceOriginalIDR = document.getElementById('priceOriginalIDR');
    const savingsIDR = document.getElementById('savingsIDR');
    
    // Exchange rate: 1 USD = 15,000 IDR (approximate)
    // Price is $99 USD (after 25% discount from $132)
    const usdPrice = 99;
    const usdOriginalPrice = 132;
    const exchangeRate = 15000;
    
    const rupiahPrice = usdPrice * exchangeRate;
    const rupiahOriginalPrice = usdOriginalPrice * exchangeRate;
    const rupiahSavings = rupiahOriginalPrice - rupiahPrice;
    
    // Format with thousand separators (Indonesian format: 1.485.000)
    function formatIDR(amount) {
        return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    
    if (priceIDR) {
        priceIDR.textContent = formatIDR(rupiahPrice);
    }
    
    if (priceOriginalIDR) {
        priceOriginalIDR.textContent = 'Rp ' + formatIDR(rupiahOriginalPrice);
    }
    
    if (savingsIDR) {
        savingsIDR.textContent = 'Rp ' + formatIDR(rupiahSavings);
    }
}

// Call on page load
updatePriceInRupiah();

// Form submission handler
const contactForm = document.querySelector('.contact-form');

if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Get form values
        const formData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            subject: document.getElementById('subject').value,
            message: document.getElementById('message').value
        };
        
        // Here you would typically send the data to a server
        console.log('Form submitted:', formData);
        
        // Show success message (you can customize this)
        alert('Thank you for your message! We will get back to you soon.');
        
        // Reset form
        contactForm.reset();
    });
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        
        if (target) {
            const offsetTop = target.offsetTop - 80;
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        }
    });
});

// Intersection Observer for fade-in animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', () => {
    const animateElements = document.querySelectorAll('.about-card, .feature-card, .sensor-card-tech');
    
    animateElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
        observer.observe(el);
    });
});

// Order button handler
const orderButtons = document.querySelectorAll('.btn-primary');

orderButtons.forEach(button => {
    if (button.textContent.includes('Order')) {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            // Here you would typically redirect to a checkout page
            alert('Redirecting to checkout...');
            // window.location.href = 'checkout.html';
        });
    }
});


