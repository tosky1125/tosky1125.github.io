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
