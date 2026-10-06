// Versioned IDs preserve the rights of payments created before these offers.
export const PACKAGES=Object.freeze({
 '79':{price:79,g:0,h:0,name:'รับรูปนี้',requiresImage:true,fullEdit:true},
 '79_v2':{price:79,g:1,h:0,name:'รับรูป / สร้าง 1 ครั้ง',requiresImage:false,fullEdit:true},
 '149_v2':{price:149,g:3,h:0,name:'สร้างเพิ่ม 3 ครั้ง',requiresImage:false,fullEdit:false},
 '149':{price:149,g:1,h:2,legacy:true},
 '199':{price:199,g:2,h:3,legacy:true}
});
export function packageFor(id){const p=PACKAGES[String(id)];if(!p)throw Error('invalid_package');return p;}
export function checkoutPackage(id){const key=String(id)==='149'?'149_v2':String(id)==='79'?'79_v2':String(id);const p=packageFor(key);if(p.legacy)throw Error('invalid_package');return {id:key,...p};}
export function remaining(row){return Number(row?.generation_remaining||0)+Number(row?.hair_remaining||0);}
