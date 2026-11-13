/* Tema salvo ou preferência do sistema, aplicado antes da página aparecer */
(function(){var t=null;try{t=localStorage.getItem('kawai-tema')}catch(e){}
if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
document.documentElement.setAttribute('data-theme',t)})();
