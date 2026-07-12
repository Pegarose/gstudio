(function() {
  let hoveredElement = null;
  let inspecting = false;

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'TOGGLE_INSPECTOR') {
      inspecting = e.data.active;
      if (!inspecting && hoveredElement) {
        hoveredElement.style.outline = '';
        hoveredElement = null;
      }
    }
    
    if (e.data && e.data.type === 'RUN_SEO_AUDIT') {
      const title = document.title || '';
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
      const h1Count = document.querySelectorAll('h1').length;
      
      // Calculate missing alt tags
      const images = document.querySelectorAll('img');
      let imagesWithoutAlt = 0;
      images.forEach(img => {
        if (!img.getAttribute('alt') || img.getAttribute('alt').trim() === '') {
          imagesWithoutAlt++;
        }
      });

      window.parent.postMessage({
        type: 'SEO_AUDIT_RESULTS',
        title,
        metaDesc,
        viewport,
        h1Count,
        imagesWithoutAlt
      }, '*');
    }
  });

  document.addEventListener('mouseover', (e) => {
    if (!inspecting) return;
    if (hoveredElement && hoveredElement !== e.target) {
      hoveredElement.style.outline = '';
    }
    hoveredElement = e.target;
    // Set visual outline
    hoveredElement.style.outline = '2px dashed #f97316'; // Orange dashed line
    hoveredElement.style.cursor = 'pointer';
  });

  document.addEventListener('mouseout', (e) => {
    if (!inspecting) return;
    if (hoveredElement) {
      hoveredElement.style.outline = '';
    }
  });

  document.addEventListener('click', (e) => {
    if (!inspecting) return;
    e.preventDefault();
    e.stopPropagation();
    
    const tag = e.target.tagName.toLowerCase();
    const text = e.target.textContent?.trim() || '';
    const className = e.target.className || '';
    
    // Get computed styles for visual editing
    const styles = window.getComputedStyle(e.target);
    const computed = {
      color: styles.color,
      backgroundColor: styles.backgroundColor,
      padding: styles.padding,
      margin: styles.margin,
      display: styles.display,
      flexDirection: styles.flexDirection,
      gap: styles.gap,
      borderWidth: styles.borderWidth,
      borderColor: styles.borderColor
    };
    
    window.parent.postMessage({
      type: 'ELEMENT_SELECTED',
      tag,
      text: text.substring(0, 80),
      className,
      computed
    }, '*');
  });
})();
