/* =========================================================
   스크롤하면 섹션이 하나씩 나타나는 효과.

   시작화면은 CSS만으로 그려지고 움직이는 요소가 없어서
   여기서 건드리지 않는다. 이 파일이 통째로 실패해도
   <head>에서 붙인 .js-on 클래스가 없을 때와 같은 상태가 되므로
   본문은 그대로 보인다.
   ========================================================= */

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("is-visible");
        io.unobserve(e.target);
      }
    }
  },
  { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
