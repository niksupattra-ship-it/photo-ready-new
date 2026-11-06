// Skin-only options: no eyebrow, eye, cheek or lip cosmetics.
export const MAKEUP_LOOKS=[
 {id:'skin-bright-v1',name:'ผิวสว่างฟุ้ง',preview:'/assets/makeup/looks/skin-base.webp',previewFilter:'brightness(1.1) contrast(.97)'},
 {id:'skin-glow-v1',name:'เพิ่มความวาว',preview:'/assets/makeup/looks/skin-base.webp',previewFilter:'brightness(1.04) contrast(1.04)'},
 {id:'skin-smooth-v1',name:'ผิวเนียน',preview:'/assets/makeup/looks/skin-base.webp',previewFilter:'contrast(.97)'}
];
export function makeupLook(id){return MAKEUP_LOOKS.find(look=>look.id===id)||null}
