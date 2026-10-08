// Versioned IDs preserve the rights of payments created before these offers.
export const PACKAGES=Object.freeze({
 '79':{price:79,g:0,h:0,name:'รับรูปนี้',requiresImage:true,fullEdit:true},
 '79_v2':{price:89,g:1,h:0,name:'รับรูป / สร้าง 1 ครั้ง',requiresImage:false,fullEdit:true},
 '149_v2':{price:159,g:3,h:0,name:'สร้าง 3 ครั้ง',requiresImage:false,fullEdit:false},
 '149_trial_v3':{price:159,g:2,h:0,name:'รับรูปนี้ + สร้างเพิ่ม 2 ครั้ง',requiresImage:true,fullEdit:false},
 '89_image_v3':{price:89,g:0,h:0,name:'รับรูปนี้',requiresImage:true,fullEdit:true},
 '159_v4':{price:159,g:10,h:0,name:'สร้าง 10 ครั้ง',requiresImage:false,fullEdit:false},
 '149':{price:149,g:1,h:2,legacy:true},
 '199':{price:199,g:2,h:3,legacy:true}
});
export function packageFor(id){const p=PACKAGES[String(id)];if(!p)throw Error('invalid_package');return p;}
export function checkoutPackage(id){const key=['149','159'].includes(String(id))?'159_v4':['79','89'].includes(String(id))?'79_v2':String(id);const p=packageFor(key);if(p.legacy)throw Error('invalid_package');return {id:key,...p};}
export function remaining(row){return Number(row?.generation_remaining||0)+Number(row?.hair_remaining||0);}
