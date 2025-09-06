// Language switching
function switchSiteLanguage(lang) {
  localStorage.setItem('site-language', lang);
  document.body.setAttribute('data-lang', lang);
  
  // Update active language button
  document.querySelectorAll('.lang-btn').forEach(function(el) {
    el.classList.remove('active');
  });
  const langBtn = document.getElementById('lang-' + lang);
  if (langBtn) {
    langBtn.classList.add('active');
  }
  
  // Filter content based on language
  filterContentByLanguage(lang);
}

function filterContentByLanguage(lang) {
  // Filter posts in archive page
  const posts = document.querySelectorAll('.post-item');
  posts.forEach(function(post) {
    const postLang = post.getAttribute('data-lang');
    if (postLang) {
      post.style.display = (postLang === lang || !postLang) ? 'block' : 'none';
    }
  });
  
  // Update year headers visibility
  const years = document.querySelectorAll('h2');
  years.forEach(function(yearHeader) {
    const nextSibling = yearHeader.nextElementSibling;
    let hasVisiblePosts = false;
    let sibling = nextSibling;
    
    while (sibling && sibling.tagName !== 'H2') {
      if (sibling.classList.contains('post-item') && sibling.style.display !== 'none') {
        hasVisiblePosts = true;
        break;
      }
      sibling = sibling.nextElementSibling;
    }
    
    yearHeader.style.display = hasVisiblePosts ? 'block' : 'none';
  });
}

// Initialize language on page load
document.addEventListener('DOMContentLoaded', function() {
  const savedLang = localStorage.getItem('site-language') || 'en';
  switchSiteLanguage(savedLang);
});

(() => {
  // Theme switch
  const body = document.body;
  const lamp = document.getElementById("mode");
  
  // Check if lamp exists before adding event listener
  if (lamp) {
    const initTheme = () => {
      const theme = localStorage.getItem("theme") || "light";
      if (theme === "dark") {
        body.setAttribute("data-theme", "dark");
      } else {
        body.removeAttribute("data-theme");
      }
    };

    const toggleTheme = () => {
      const currentTheme = body.getAttribute("data-theme");
      if (currentTheme === "dark") {
        localStorage.setItem("theme", "light");
        body.removeAttribute("data-theme");
      } else {
        localStorage.setItem("theme", "dark");
        body.setAttribute("data-theme", "dark");
      }
    };
    
    // Initialize theme on page load
    initTheme();

    // Add click event listener
    lamp.addEventListener("click", toggleTheme);
  }

  // Blur the content when the menu is open
  const cbox = document.getElementById("menu-trigger");

  if (cbox) {
    cbox.addEventListener("change", function () {
      const area = document.querySelector(".wrapper");
      if (area) {
        this.checked
          ? area.classList.add("blurry")
          : area.classList.remove("blurry");
      }
    });
  }
})();
