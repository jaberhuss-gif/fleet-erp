// Knowledge Base - 3 Languages (EN/AR/UR) + Smart Auto-Classification
export const KNOWLEDGE_BASE = [
  // ===== VEHICLE ISSUES =====
  {
    id: 'v-engine-temp',
    category: 'Vehicle',
    subCategory: 'Engine',
    title: 'Engine Temperature High / Overheating',
    titleAr: 'ارتفاع درجة حرارة المحرك',
    titleUr: 'انجن کا درجہ حرارت زیادہ',
    keywords: ['engine temperature', 'overheat', 'hot engine', 'temperature high', 'heat',
               'حرارة', 'سخونة', 'محرك ساخن', 'درجة حرارة', 'سخن',
               'انجن', 'گرم', 'حد سے زیادہ گرم', 'حرارت'],
    causes: ['Low coolant / radiator water level', 'Radiator fan not working', 'Thermostat stuck closed', 'Water pump failure', 'Radiator leak or blockage', 'Broken radiator cap', 'Low engine oil', 'Head gasket failure', 'Coolant hose leak', 'Air in cooling system'],
    causesAr: ['نقص سائل التبريد / ماء الرديتر', 'مروحة الرديتر لا تعمل', 'الترموستات معلق مغلق', 'تلف مضخة الماء', 'تسريب أو انسداد في الرديتر', 'غطاء الرديتر مكسور', 'نقص زيت المحرك', 'تلف وجه السلندر', 'تسريب في خرطوم التبريد', 'هواء في نظام التبريد'],
    causesUr: ['کولنٹ کی کمی', 'ریڈی ایٹر پنکھا کام نہیں کر رہا', 'تھرموسٹیٹ بند ہے', 'واٹر پمپ خراب', 'ریڈی ایٹر میں لیکیج', 'ریڈی ایٹر کا ڈھکن ٹوٹا', 'انجن آئل کم', 'ہیڈ گیسکٹ فیل', 'کولنٹ ہوز لیک', 'سسٹم میں ہوا'],
    solutions: ['Turn off A/C and stop safely', 'Check coolant level (add water if low)', 'Check for leaks under vehicle', 'Check radiator fan — does it spin?', 'Check coolant hoses for cracks', 'Do NOT open radiator cap when hot', 'Tow to workshop if severely overheated'],
    solutionsAr: ['أوقف المكيف وتوقف بأمان', 'افحص مستوى سائل التبريد', 'افحص وجود تسريب تحت السيارة', 'افحص مروحة الرديتر — هل تدور؟', 'افحص الخراطيم للتشققات', 'لا تفتح غطاء الرديتر وهو ساخن', 'اسحب السيارة للورشة إذا سخنت كثيراً'],
    solutionsUr: ['اے سی بند کریں اور بحفاظت رکیں', 'کولنٹ کی سطح چیک کریں', 'گاڑی کے نیچے لیکیج دیکھیں', 'ریڈی ایٹر پنکھا چیک کریں', 'ہوز چیک کریں', 'گرم حالت میں ریڈی ایٹر کا ڈھکن نہ کھولیں', 'ورکشاپ لے جائیں'],
    urgency: 'Critical'
  },
  {
    id: 'v-wont-start',
    category: 'Vehicle',
    subCategory: 'Engine',
    title: 'Engine Will Not Start',
    titleAr: 'المحرك لا يعمل',
    titleUr: 'انجن سٹارٹ نہیں ہو رہا',
    keywords: ['wont start', 'not starting', 'engine dead', 'no start', 'engine off',
               'لا يعمل', 'ما يشتغل', 'محرك ميت',
               'سٹارٹ نہیں', 'انجن بند', 'چالو نہیں'],
    causes: ['Dead battery', 'Empty fuel tank', 'Faulty starter motor', 'Ignition switch problem', 'Fuel pump failure', 'Blown fuse', 'Bad spark plugs', 'Immobilizer issue', 'Loose battery terminals'],
    causesAr: ['بطارية فارغة', 'خزان الوقود فارغ', 'تلف مارش التشغيل', 'مشكلة في مفتاح الإشعال', 'تلف مضخة الوقود', 'فحم محروق', 'شمعات احتراق سيئة', 'مشكلة في مانع التشغيل', 'أطراف البطارية مفكوكة'],
    causesUr: ['بیٹری ختم', 'پٹرول ٹینک خالی', 'سٹارٹر خراب', 'اگنیشن سوئچ مسئلہ', 'فیول پمپ خراب', 'فیوز جل گیا', 'اسپارک پلگ خراب', 'امیوبلائزر مسئلہ', 'بیٹری ٹرمینل ڈھیلے'],
    solutions: ['Check battery terminals', 'Try jump-starting', 'Check fuel level', 'Listen for clicking sound', 'Check fuse box', 'Check if lights turn on'],
    solutionsAr: ['افحص أطراف البطارية', 'جرب تشغيل ببطارية أخرى', 'افحص مستوى الوقود', 'استمع لصوت الطقطقة', 'افحص علبة الفيوزات', 'افحص إذا الأنوار تعمل'],
    solutionsUr: ['بیٹری ٹرمینل چیک کریں', 'دوسری گاڑی سے سٹارٹ کریں', 'پٹرول چیک کریں', 'آواز سنیں', 'فیوز باکس چیک کریں', 'لائٹ چیک کریں'],
    urgency: 'Critical'
  },
  {
    id: 'v-ac-not-cooling',
    category: 'Vehicle',
    subCategory: 'A/C',
    title: 'A/C Not Cooling',
    titleAr: 'المكيف لا يبرد',
    titleUr: 'اے سی ٹھنڈا نہیں کر رہا',
    keywords: ['ac', 'air condition', 'not cooling', 'hot air', 'a/c', 'aircon', 'cooling',
               'مكيف', 'تكييف', 'لا يبرد', 'هواء حار', 'تبريد',
               'اے سی', 'ٹھنڈا نہیں', 'گرم ہوا', 'کولنگ'],
    causes: ['Low Freon gas', 'Dirty cabin filter', 'Clogged condenser', 'Compressor failure', 'AC belt broken', 'Electrical issue', 'Blocked expansion valve', 'Blocked drain'],
    causesAr: ['نقص غاز الفريون', 'فلتر المكيف متسخ', 'انسداد المكثف', 'تلف الكمبروسر', 'تلف سير المكيف', 'مشكلة كهربائية', 'انسداد صمام التمدد', 'انسداد التصريف'],
    causesUr: ['فرین گیس کم', 'کیبن فلٹر گندا', 'کنسڈنسر بند', 'کمپریسر خراب', 'اے سی بیلٹ ٹوٹا', 'بجلی کا مسئلہ', 'ایکسپینشن والو بند', 'ڈرین بند'],
    solutions: ['Check Freon gas level', 'Clean/replace cabin filter', 'Wash condenser', 'Check compressor engages', 'Check AC fuse', 'Add Freon if low'],
    solutionsAr: ['افحص مستوى الفريون', 'نظف أو استبدل الفلتر', 'اغسل المكثف', 'افحص تشغيل الكمبروسر', 'افحص فيوز المكيف', 'أضف فريون'],
    solutionsUr: ['فرین چیک کریں', 'فلٹر صاف کریں', 'کنسڈنسر دھوئیں', 'کمپریسر چیک کریں', 'فیوز چیک کریں', 'فرین ڈالیں'],
    urgency: 'Medium'
  },
  {
    id: 'v-tire-puncture',
    category: 'Vehicle',
    subCategory: 'Tires',
    title: 'Tire Puncture / Flat',
    titleAr: 'إطار مثقوب',
    titleUr: 'ٹائر پنکچر',
    keywords: ['tire', 'tyre', 'flat', 'puncture', 'wheel', 'tire burst', 'blowout',
               'كفر', 'إطار', 'بنشر', 'مثقوب', 'عجلة',
               'ٹائر', 'پنکچر', 'ہوا نکل', 'پہیہ'],
    causes: ['Nail or screw in tire', 'Valve stem leak', 'Damaged rim', 'Worn-out tire', 'Sidewall damage', 'Bead leak'],
    causesAr: ['مسمار أو برغي في الإطار', 'تسريب صمام الهواء', 'تلف الجنط', 'إطار مستهلك', 'تلف الجانب', 'تسريب الحافة'],
    causesUr: ['ٹائر میں کیل', 'والو لیک', 'رِم خراب', 'ٹائر گھسا', 'سائیڈ وال خراب', 'بیڈ لیک'],
    solutions: ['Stop safely', 'Replace with spare', 'Check for nails', 'Inflate to pressure', 'Go to workshop'],
    solutionsAr: ['توقف بأمان', 'استبدل بالإطار الاحتياطي', 'افحص المسامير', 'انفخ للضغط المطلوب', 'اتجه للورشة'],
    solutionsUr: ['بحفاظت رکیں', 'اسپیئر لگائیں', 'کیل چیک کریں', 'ہوا بھریں', 'ورکشاپ جائیں'],
    urgency: 'High'
  },
  {
    id: 'v-brake-noise',
    category: 'Vehicle',
    subCategory: 'Brakes',
    title: 'Brake Noise / Squeaking',
    titleAr: 'صوت في الفرامل',
    titleUr: 'بریک میں آواز',
    keywords: ['brake', 'squeak', 'grinding', 'noise brake', 'braking', 'brake noise',
               'فرامل', 'بريك', 'صوت', 'صرير',
               'بریک', 'آواز', 'چیخ', 'بریک کی آواز'],
    causes: ['Worn-out brake pads', 'Brake disc warp', 'Dust in brake system', 'Metal-to-metal contact', 'Brake caliper stuck', 'Low brake fluid', 'Rusted discs'],
    causesAr: ['تآكل فحمات الفرامل', 'انحناء أقراص الفرامل', 'غبار في نظام الفرامل', 'تلامس معدني', 'انحشار الكاليبر', 'نقص زيت الفرامل', 'صدأ الأقراص'],
    causesUr: ['بریک پیڈ گھسے', 'بریک ڈسک ٹیڑھی', 'سسٹم میں دھول', 'دھات دھات رگڑ', 'کیلیپر پھنس گیا', 'بریک فلوئڈ کم', 'ڈسک زنگ آلود'],
    solutions: ['Stop driving if grinding', 'Check brake pads thickness', 'Replace pads if <3mm', 'Check brake fluid', 'Clean brake dust'],
    solutionsAr: ['توقف عن القيادة إذا كان هناك صرير معدني', 'افحص سمك الفحمات', 'استبدل الفحمات إذا أقل من 3 ملم', 'افحص زيت الفرامل', 'نظف الغبار'],
    solutionsUr: ['اگر چیخ رہی ہو تو رکیں', 'پیڈ کی موٹائی چیک کریں', '3 ملی میٹر سے کم ہو تو بدلیں', 'بریک فلوئڈ چیک کریں', 'دھول صاف کریں'],
    urgency: 'Critical'
  },
  {
    id: 'v-battery-dead',
    category: 'Vehicle',
    subCategory: 'Electrical',
    title: 'Battery Dead / Weak',
    titleAr: 'بطارية ضعيفة',
    titleUr: 'بیٹری کمزور',
    keywords: ['battery', 'dead battery', 'weak battery', 'no power', 'battery issue',
               'بطارية', 'ضعيفة', 'فارغة',
               'بیٹری', 'کمزور', 'ختم', 'بیٹری مسئلہ'],
    causes: ['Old battery (>3 years)', 'Alternator not charging', 'Loose terminals', 'Corroded terminals', 'Short circuit', 'Lights left on', 'Low fluid'],
    causesAr: ['بطارية قديمة (أكثر من 3 سنوات)', 'الدينمو لا يشحن', 'أطراف مفكوكة', 'تأكسد الأطراف', 'قصر كهربائي', 'الأنوار متروكة', 'نقص السائل'],
    causesUr: ['بیٹری پرانی (3+ سال)', 'الٹرنیٹر چارج نہیں کر رہا', 'ٹرمینل ڈھیلے', 'ٹرمینل زنگ آلود', 'شارٹ سرکٹ', 'لائٹ آن چھوڑ دی', 'فلوئڈ کم'],
    solutions: ['Jump start', 'Check terminal tightness', 'Test voltage (12.6V+)', 'Test alternator output', 'Replace if >4 years'],
    solutionsAr: ['شغّل ببطارية ثانية', 'افحص شد الأطراف', 'افحص الجهد (12.6 فولت)', 'افحص الدينمو', 'استبدل إذا أكثر من 4 سنوات'],
    solutionsUr: ['جمپ سٹارٹ کریں', 'ٹرمینل چیک کریں', 'وولٹیج چیک کریں (12.6V)', 'الٹرنیٹر چیک کریں', '4 سال سے پرانی ہو تو بدلیں'],
    urgency: 'High'
  },
  {
    id: 'v-oil-leak',
    category: 'Vehicle',
    subCategory: 'Engine',
    title: 'Oil Leak / Low Oil',
    titleAr: 'تسريب زيت',
    titleUr: 'تیل کا رساؤ',
    keywords: ['oil leak', 'low oil', 'oil light', 'oil pressure',
               'زيت', 'تسريب زيت', 'نقص زيت', 'ضغط الزيت',
               'تیل', 'رساؤ', 'تیل کی کمی', 'تیل کا دباؤ'],
    causes: ['Worn gasket/seal', 'Oil pan plug loose', 'Oil filter not tight', 'Valve cover gasket', 'Rear main seal', 'Cracked oil pan'],
    causesAr: ['تآكل الحشوة', 'صرة الكارتيل مفكوكة', 'فلتر الزيت غير محكم', 'حشوة غطاء الصمامات', 'ختم الكرنك الخلفي', 'شق في الكارتيل'],
    causesUr: ['گیسکٹ گھسا', 'آئل پین پلگ ڈھیلا', 'آئل فلٹر ڈھیلا', 'والو کور گیسکٹ', 'ریئر مین سیل', 'آئل پین میں شگاف'],
    solutions: ['Do NOT drive if oil light on', 'Check oil level', 'Add oil to correct level', 'Check under vehicle', 'Tighten oil plug'],
    solutionsAr: ['لا تقس إذا كانت لمبة الزيت مضاءة', 'افحص مستوى الزيت', 'أضف زيت', 'افحص تحت السيارة', 'شد صرة الزيت'],
    solutionsUr: ['آئل لائٹ آن ہو تو نہ چلائیں', 'آئل لیول چیک کریں', 'تیل ڈالیں', 'گاڑی کے نیچے دیکھیں', 'پلگ سخت کریں'],
    urgency: 'Critical'
  },
  {
    id: 'v-steering-hard',
    category: 'Vehicle',
    subCategory: 'Steering',
    title: 'Steering Hard / Stiff',
    titleAr: 'الدركسون ثقيل',
    titleUr: 'اسٹیئرنگ سخت',
    keywords: ['steering', 'hard steering', 'stiff', 'steering wheel', 'power steering',
               'دركسون', 'ثقل', 'مقود', 'باورة',
               'اسٹیئرنگ', 'سخت', 'بھاری'],
    causes: ['Low power steering fluid', 'Pump failure', 'Broken belt', 'Worn tie rods', 'Low tire pressure', 'Rack leak'],
    causesAr: ['نقص زيت الباورة', 'تلف مضخة الباورة', 'سير مقطوع', 'تآكل أذرع التوجيه', 'ضغط الإطارات منخفض', 'تسريب الجير'],
    causesUr: ['پاور اسٹیئرنگ فلوئڈ کم', 'پمپ خراب', 'بیلٹ ٹوٹی', 'ٹائی راڈ گھسی', 'ٹائر پریشر کم', 'ریک لیک'],
    solutions: ['Check fluid level', 'Add fluid', 'Check belt', 'Check tire pressure', 'Do NOT drive if leaking badly'],
    solutionsAr: ['افحص مستوى الزيت', 'أضف زيت', 'افحص السير', 'افحص ضغط الإطارات', 'لا تقس إذا التسريب كبير'],
    solutionsUr: ['فلوئڈ چیک کریں', 'فلوئڈ ڈالیں', 'بیلٹ چیک کریں', 'ٹائر پریشر چیک کریں', 'زیادہ لیک ہو تو نہ چلائیں'],
    urgency: 'High'
  },
  {
    id: 'v-smoke-exhaust',
    category: 'Vehicle',
    subCategory: 'Engine',
    title: 'Smoke from Exhaust',
    titleAr: 'دخان من العادم',
    titleUr: 'ایگزاسٹ سے دھواں',
    keywords: ['smoke', 'exhaust', 'white smoke', 'black smoke', 'blue smoke',
               'دخان', 'عادم', 'دخان أبيض', 'دخان أسود', 'دخان أزرق',
               'دھواں', 'ایگزاسٹ', 'سفید دھواں', 'کالا دھواں', 'نیلا دھواں'],
    causes: ['White: burning coolant', 'Blue: burning oil', 'Black: rich fuel mix', 'Injector issues', 'Turbo failure', 'Clogged air filter'],
    causesAr: ['أبيض: حرق سائل التبريد', 'أزرق: حرق الزيت', 'أسود: خليط وقود غني', 'مشاكل الحاقن', 'تلف التيربو', 'انسداد فلتر الهواء'],
    causesUr: ['سفید: کولنٹ جل رہا', 'نیلا: آئل جل رہا', 'کالا: زیادہ ایندھن', 'انجیکٹر مسئلہ', 'ٹربو خراب', 'ایئر فلٹر بند'],
    solutions: ['Identify smoke color', 'White = head gasket (STOP)', 'Blue = engine oil issue', 'Black = fuel system', 'Workshop immediately'],
    solutionsAr: ['حدد لون الدخان', 'أبيض = وجه السلندر (توقف)', 'أزرق = مشكلة زيت', 'أسود = نظام الوقود', 'اتجه للورشة فوراً'],
    solutionsUr: ['دھوئیں کا رنگ دیکھیں', 'سفید = ہیڈ گیسکٹ (رکیں)', 'نیلا = آئل مسئلہ', 'کالا = فیول سسٹم', 'فوراً ورکشاپ'],
    urgency: 'Critical'
  },
  {
    id: 'v-vibration',
    category: 'Vehicle',
    subCategory: 'Suspension',
    title: 'Vehicle Vibration',
    titleAr: 'اهتزاز السيارة',
    titleUr: 'گاڑی کا کمپن',
    keywords: ['vibration', 'shake', 'shaking', 'wobble',
               'اهتزاز', 'رجفة', 'ارتجاج',
               'کمپن', 'جھٹکا', 'ہلنا'],
    causes: ['Wheel alignment off', 'Wheel balancing needed', 'Warped brake disc', 'Worn suspension', 'Bent rim', 'Engine mount worn', 'Uneven tire wear'],
    causesAr: ['مشكلة في الميلان', 'يحتاج ترصيص', 'انحناء قرص الفرامل', 'تآكل المساعدين', 'انحناء الجنط', 'تآكل كرسي المحرك', 'تآكل غير متساوٍ للإطارات'],
    causesUr: ['وہیل الائنمنٹ خراب', 'وہیل بیلنسنگ ضروری', 'بریک ڈسک ٹیڑھی', 'سسپنشن گھسا', 'رِم ٹیڑھا', 'انجن ماؤنٹ گھسا', 'ٹائر گھسا'],
    solutions: ['Check alignment', 'Balance wheels', 'Inspect tires', 'Check suspension', 'If during braking = disc'],
    solutionsAr: ['افحص الميلان', 'رصص الإطارات', 'افحص الإطارات', 'افحص المساعدين', 'إذا أثناء الفرملة = الأقراص'],
    solutionsUr: ['الائنمنٹ چیک کریں', 'بیلنس کریں', 'ٹائر چیک کریں', 'سسپنشن چیک کریں', 'بریک کے دوران = ڈسک'],
    urgency: 'Medium'
  },
  {
    id: 'v-wipers',
    category: 'Vehicle',
    subCategory: 'Body',
    title: 'Wipers Not Working',
    titleAr: 'المساحات لا تعمل',
    titleUr: 'وائپر کام نہیں کر رہے',
    keywords: ['wiper', 'wiper not working', 'wipers',
               'مساحات', 'ماسحة', 'مساحة',
               'وائپر', 'وائپرز'],
    causes: ['Blown fuse', 'Wiper motor failure', 'Broken linkage', 'Worn wiper blades', 'Switch fault'],
    causesAr: ['فحم محروق', 'تلف موتور المساحات', 'كسر في الرابط', 'تآكل المساحات', 'خلل في المفتاح'],
    causesUr: ['فیوز جل گیا', 'وائپر موٹر خراب', 'لنکیج ٹوٹی', 'وائپر بلیڈ گھسے', 'سوئچ خراب'],
    solutions: ['Check wiper fuse', 'Check switch', 'Replace blades', 'Replace motor if dead', 'Do NOT drive in rain'],
    solutionsAr: ['افحص فيوز المساحات', 'افحص المفتاح', 'استبدل المساحات', 'استبدل الموتور إذا تالف', 'لا تقس في المطر'],
    solutionsUr: ['وائپر فیوز چیک کریں', 'سوئچ چیک کریں', 'بلیڈ بدلیں', 'موٹر بدلیں', 'بارش میں نہ چلائیں'],
    urgency: 'High'
  },
  {
    id: 'v-door-lock',
    category: 'Vehicle',
    subCategory: 'Body',
    title: 'Door Lock Issue',
    titleAr: 'مشكلة في قفل الباب',
    titleUr: 'دروازے کا لاک مسئلہ',
    keywords: ['door lock', 'door stuck', 'lock issue', 'door wont open',
               'قفل', 'باب', 'باب عالق',
               'دروازہ', 'تالا', 'لاک'],
    causes: ['Broken actuator', 'Stuck latch', 'Broken handle', 'Sensor failure', 'Central lock issue', 'Key fob battery dead'],
    causesAr: ['تلف المشغل', 'انحشار المزلاج', 'كسر المقبض', 'تلف الحساس', 'مشكلة القفل المركزي', 'بطارية الريموت فارغة'],
    causesUr: ['ایکچویٹر خراب', 'لیچ پھنس گیا', 'ہینڈل ٹوٹا', 'سینسر خراب', 'سنٹرل لاک مسئلہ', 'ریموٹ بیٹری ختم'],
    solutions: ['Unlock manually with key', 'Check fob battery', 'Spray lubricant', 'Check handle mechanism', 'Replace sensor'],
    solutionsAr: ['افتح يدوياً بالمفتاح', 'افحص بطارية الريموت', 'رش مادة تشحيم', 'افحص المقبض', 'استبدل الحساس'],
    solutionsUr: ['چابی سے کھولیں', 'ریموٹ بیٹری چیک کریں', 'لیوبریکنٹ لگائیں', 'ہینڈل چیک کریں', 'سینسر بدلیں'],
    urgency: 'Medium'
  },
  {
    id: 'v-transmission',
    category: 'Vehicle',
    subCategory: 'Transmission',
    title: 'Transmission / Gear Issue',
    titleAr: 'مشكلة في الجير',
    titleUr: 'گیئر / ٹرانسمیشن مسئلہ',
    keywords: ['transmission', 'gear', 'clutch', 'gearbox', 'gear shift',
               'جير', 'كلتش', 'ناقل', 'تعشيق',
               'گیئر', 'کلچ', 'ٹرانسمیشن'],
    causes: ['Low transmission fluid', 'Worn clutch', 'Faulty solenoid', 'Transmission leak', 'Bad torque converter', 'Linkage problem'],
    causesAr: ['نقص زيت الجير', 'تآكل الكلتش', 'تلف الصولونويد', 'تسريب الجير', 'تلف محول العزم', 'مشكلة في الوصلات'],
    causesUr: ['ٹرانسمیشن فلوئڈ کم', 'کلچ گھسا', 'سولینوئڈ خراب', 'ٹرانسمیشن لیک', 'ٹارک کنورٹر خراب', 'لنکیج مسئلہ'],
    solutions: ['Check fluid level', 'Check for leaks', 'Do NOT force gears', 'Tow if not engaging', 'Check clutch pedal'],
    solutionsAr: ['افحص مستوى الزيت', 'افحص التسريب', 'لا تجبر التعشيق', 'اسحب السيارة إذا لا يعشق', 'افحص دعسة الكلتش'],
    solutionsUr: ['فلوئڈ چیک کریں', 'لیک چیک کریں', 'زبردستی نہ کریں', 'اگر گیئر نہ لگے تو ٹو کریں', 'کلچ پیڈل چیک کریں'],
    urgency: 'Critical'
  },
  {
    id: 'v-check-engine-light',
    category: 'Vehicle',
    subCategory: 'Engine',
    title: 'Check Engine Light On',
    titleAr: 'لمبة المحرك مضاءة',
    titleUr: 'چیک انجن لائٹ آن',
    keywords: ['check engine', 'engine light', 'warning light', 'engine symbol',
               'لمبة محرك', 'تشك انجن', 'لمبة تحذير',
               'چیک انجن', 'انجن لائٹ', 'وارننگ لائٹ'],
    causes: ['Oxygen sensor', 'Mass air flow sensor', 'Catalytic converter', 'Spark plug misfire', 'Fuel injector', 'Loose gas cap', 'Vacuum leak'],
    causesAr: ['حساس الأكسجين', 'حساس تدفق الهواء', 'المحول الحفاز', 'اشتعال خاطئ', 'حاقن الوقود', 'غطاء الوقود مفكوك', 'تسريب هواء'],
    causesUr: ['آکسیجن سینسر', 'ماس ایئر فلو سینسر', 'کیٹلیٹک کنورٹر', 'اسپارک پلگ مس فائر', 'فیول انجیکٹر', 'گیس کیپ ڈھیلا', 'ویکیوم لیک'],
    solutions: ['Tighten gas cap', 'Use OBD scanner', 'Check spark plugs', 'Check air filter', 'Workshop if persists'],
    solutionsAr: ['شد غطاء الوقود', 'استخدم جهاز OBD', 'افحص شمعات الاحتراق', 'افحص فلتر الهواء', 'الورشة إذا استمر'],
    solutionsUr: ['گیس کیپ سخت کریں', 'OBD سکینر استعمال کریں', 'اسپارک پلگ چیک کریں', 'ایئر فلٹر چیک کریں', 'ورکشاپ جائیں'],
    urgency: 'Medium'
  },
  {
    id: 'v-radiator-fan',
    category: 'Vehicle',
    subCategory: 'Cooling',
    title: 'Radiator Fan Not Working',
    titleAr: 'مروحة الرديتر لا تعمل',
    titleUr: 'ریڈی ایٹر پنکھا کام نہیں کر رہا',
    keywords: ['radiator fan', 'cooling fan', 'fan not working', 'engine fan',
               'مروحة', 'رديتر', 'مروحة الرديتر',
               'پنکھا', 'ریڈی ایٹر', 'کولنگ فین'],
    causes: ['Blown fuse', 'Bad fan motor', 'Faulty relay', 'Temperature sensor', 'Wiring issue', 'Bad fan clutch'],
    causesAr: ['فحم محروق', 'موتور المروحة تالف', 'ريلاي تالف', 'حساس الحرارة', 'مشكلة في الأسلاك', 'كلتش المروحة'],
    causesUr: ['فیوز جل گیا', 'پنکھا موٹر خراب', 'ریلے خراب', 'ٹمپریچر سینسر', 'وائرنگ مسئلہ', 'پنکھا کلچ خراب'],
    solutions: ['Check fan fuse', 'Test fan direct 12V', 'Check relay', 'Check temp sensor', 'Replace motor'],
    solutionsAr: ['افحص فيوز المروحة', 'افحص المروحة بـ 12 فولت', 'افحص الريلاي', 'افحص حساس الحرارة', 'استبدل الموتور'],
    solutionsUr: ['پنکھا فیوز چیک کریں', 'پنکھا 12V پر ٹیسٹ کریں', 'ریلے چیک کریں', 'سینسر چیک کریں', 'موٹر بدلیں'],
    urgency: 'High'
  },
  {
    id: 'v-fuel-pump',
    category: 'Vehicle',
    subCategory: 'Fuel',
    title: 'Fuel Pump Issue',
    titleAr: 'مشكلة في مضخة الوقود',
    titleUr: 'فیول پمپ مسئلہ',
    keywords: ['fuel pump', 'no fuel', 'fuel issue', 'no fuel pressure',
               'مضخة بنزين', 'وقود', 'ضخ الوقود',
               'فیول پمپ', 'پٹرول', 'ایندھن'],
    causes: ['Failing fuel pump', 'Clogged fuel filter', 'Empty tank', 'Bad relay', 'Wiring issue', 'Low pressure'],
    causesAr: ['تلف مضخة الوقود', 'انسداد فلتر الوقود', 'خزان فارغ', 'ريلاي تالف', 'مشكلة الأسلاك', 'ضغط منخفض'],
    causesUr: ['فیول پمپ خراب', 'فیول فلٹر بند', 'ٹینک خالی', 'ریلے خراب', 'وائرنگ مسئلہ', 'دباؤ کم'],
    solutions: ['Listen for hum from tank', 'Check fuel filter', 'Check fuse', 'Add fuel if empty', 'Test pressure'],
    solutionsAr: ['استمع لصوت من الخزان', 'افحص فلتر الوقود', 'افحص الفيوز', 'أضف وقود إذا فارغ', 'افحص الضغط'],
    solutionsUr: ['ٹینک سے آواز سنیں', 'فیول فلٹر چیک کریں', 'فیوز چیک کریں', 'خالی ہو تو پٹرول ڈالیں', 'دباؤ چیک کریں'],
    urgency: 'Critical'
  },
  {
    id: 'v-alignment',
    category: 'Vehicle',
    subCategory: 'Tires',
    title: 'Wheel Alignment Issue',
    titleAr: 'مشكلة في الميلان',
    titleUr: 'وہیل الائنمنٹ مسئلہ',
    keywords: ['alignment', 'pulling', 'pulls to side', 'wheel alignment',
               'ميلان', 'ميزان', 'انحراف',
               'الائنمنٹ', 'میزان', 'ایک طرف کھنچنا'],
    causes: ['Hit curb', 'Worn tie rods', 'Worn ball joints', 'Bent suspension', 'Uneven tire wear'],
    causesAr: ['ضرب الرصيف', 'تآكل أذرع التوجيه', 'تآكل المفاصل', 'انحناء التعليق', 'تآكل غير متساوٍ للإطارات'],
    causesUr: ['کرپ سے ٹکر', 'ٹائی راڈ گھسی', 'بال جوائنٹ گھسے', 'سسپنشن ٹیڑھا', 'ٹائر گھسا'],
    solutions: ['Check tire pressure', 'Do alignment', 'Check suspension', 'Rotate tires'],
    solutionsAr: ['افحص ضغط الإطارات', 'اعمل ميلان', 'افحص التعليق', 'دوّر الإطارات'],
    solutionsUr: ['ٹائر پریشر چیک کریں', 'الائنمنٹ کروائیں', 'سسپنشن چیک کریں', 'ٹائر روٹیٹ کریں'],
    urgency: 'Medium'
  },
  {
    id: 'v-headlights',
    category: 'Vehicle',
    subCategory: 'Electrical',
    title: 'Headlights Not Working',
    titleAr: 'الأنوار لا تعمل',
    titleUr: 'ہیڈلائٹ کام نہیں کر رہی',
    keywords: ['headlight', 'lights', 'lamps', 'headlamp',
               'الأنوار', 'لمبات', 'ضوء أمامي',
               'ہیڈلائٹ', 'لائٹ', 'روشنی'],
    causes: ['Burnt bulb', 'Blown fuse', 'Bad relay', 'Switch issue', 'Wiring', 'Water in socket'],
    causesAr: ['لمبة محروقة', 'فحم محروق', 'ريلاي تالف', 'مفتاح معطل', 'أسلاك', 'ماء في المقبس'],
    causesUr: ['بلب جل گیا', 'فیوز جل گیا', 'ریلے خراب', 'سوئچ خراب', 'وائرنگ', 'ساکٹ میں پانی'],
    solutions: ['Replace bulb', 'Check fuse', 'Check relay', 'Check switch', 'Check wiring'],
    solutionsAr: ['استبدل اللمبة', 'افحص الفيوز', 'افحص الريلاي', 'افحص المفتاح', 'افحص الأسلاك'],
    solutionsUr: ['بلب بدلیں', 'فیوز چیک کریں', 'ریلے چیک کریں', 'سوئچ چیک کریں', 'وائرنگ چیک کریں'],
    urgency: 'High'
  },

  // ===== BUILDING ISSUES =====
  {
    id: 'b-water-leak',
    category: 'Building',
    subCategory: 'Plumbing',
    title: 'Water Leak / Dripping',
    titleAr: 'تسريب مياه',
    titleUr: 'پانی کا رساؤ',
    keywords: ['water leak', 'leak', 'dripping', 'water dripping',
               'تسريب', 'ماء', 'رطوبة', 'تنقيط',
               'پانی', 'رساؤ', 'ٹپکنا', 'لیکیج'],
    causes: ['Damaged pipe', 'Loose connection', 'Broken faucet', 'Damaged sealant', 'Clogged drain overflow', 'Water heater leak', 'Toilet tank leak', 'Roof leak'],
    causesAr: ['تلف الأنبوب', 'وصلة مفكوكة', 'صنبور مكسور', 'مانع تسرب تالف', 'انسداد التصريف', 'تسريب السخان', 'تسريب خزان المرحاض', 'تسريب السطح'],
    causesUr: ['پائپ خراب', 'کنکشن ڈھیلا', 'نل ٹوٹا', 'سیلنٹ خراب', 'ڈرین بند', 'واٹر ہیٹر لیک', 'ٹوائلٹ ٹینک لیک', 'چھت لیک'],
    solutions: ['Shut off water valve', 'Locate source', 'Tighten connections', 'Replace damaged pipe', 'Apply sealant', 'Call plumber if major'],
    solutionsAr: ['أغلق صمام الماء', 'حدد المصدر', 'شد الوصلات', 'استبدل الأنبوب التالف', 'ضع مانع تسرب', 'استدع سباك إذا كبير'],
    solutionsUr: ['واٹر والو بند کریں', 'ذریعہ ڈھونڈیں', 'کنکشن سخت کریں', 'خراب پائپ بدلیں', 'سیلنٹ لگائیں', 'بڑا ہو تو پلمبر بلائیں'],
    urgency: 'High'
  },
  {
    id: 'b-ac-not-cooling',
    category: 'Building',
    subCategory: 'HVAC',
    title: 'A/C Not Cooling',
    titleAr: 'المكيف لا يبرد',
    titleUr: 'اے سی ٹھنڈا نہیں کر رہا',
    keywords: ['ac', 'air condition', 'not cooling', 'hot air', 'hvac',
               'مكيف', 'تكييف', 'لا يبرد', 'هواء حار',
               'اے سی', 'ٹھنڈا نہیں', 'گرم ہوا'],
    causes: ['Low Freon gas', 'Dirty air filter', 'Dirty condenser coils', 'Compressor failure', 'Thermostat issue', 'Blocked drain', 'Capacitor failure', 'Frozen evaporator'],
    causesAr: ['نقص الفريون', 'فلتر الهواء متسخ', 'ملفات المكثف متسخة', 'تلف الكمبروسر', 'مشكلة الترموستات', 'انسداد التصريف', 'تلف المكثف', 'تجميد المبخر'],
    causesUr: ['فرین کم', 'ایئر فلٹر گندا', 'کنسڈنسر کوائل گندی', 'کمپریسر خراب', 'تھرموسٹیٹ مسئلہ', 'ڈرین بند', 'کیپسیٹر خراب', 'ایویپوریٹر جم گیا'],
    solutions: ['Clean/replace filter', 'Wash condenser coils', 'Check thermostat', 'Check Freon (needs tech)', 'Clean drain line', 'Check capacitor'],
    solutionsAr: ['نظف أو استبدل الفلتر', 'اغسل ملفات المكثف', 'افحص الترموستات', 'افحص الفريون (يحتاج فني)', 'نظف التصريف', 'افحص المكثف'],
    solutionsUr: ['فلٹر صاف کریں', 'کنسڈنسر دھوئیں', 'تھرموسٹیٹ چیک کریں', 'فرین چیک کریں', 'ڈرین صاف کریں', 'کیپسیٹر چیک کریں'],
    urgency: 'Medium'
  },
  {
    id: 'b-breaker-trip',
    category: 'Building',
    subCategory: 'Electrical',
    title: 'Electrical Breaker Trips',
    titleAr: 'القاطع الكهربائي يفصل',
    titleUr: 'الیکٹریکل بریکر ٹرپ',
    keywords: ['breaker', 'trip', 'electrical', 'power cut', 'circuit breaker', 'electricity',
               'كشاف', 'كهرباء', 'قاطع', 'فصل الكهرباء',
               'بریکر', 'بجلی', 'بجلی کٹ', 'ٹرپ'],
    causes: ['Overloaded circuit', 'Short circuit', 'Faulty appliance', 'Water in electrical box', 'Loose wiring', 'Damaged breaker', 'Too many devices'],
    causesAr: ['دائرة محملة', 'قصر كهربائي', 'جهاز معطل', 'ماء في صندوق الكهرباء', 'أسلاك مفكوكة', 'قاطع تالف', 'أجهزة كثيرة'],
    causesUr: ['سرکٹ اوورلوڈ', 'شارٹ سرکٹ', 'خراب آلہ', 'باکس میں پانی', 'وائرنگ ڈھیلی', 'بریکر خراب', 'بہت سے آلات'],
    solutions: ['Unplug all appliances', 'Reset breaker once', 'If trips again — call electrician', 'Check for water', 'Distribute load', 'Replace breaker if old'],
    solutionsAr: ['افصل كل الأجهزة', 'أعد تشغيل القاطع مرة', 'إذا فصل مرة ثانية — اتصل بكهربائي', 'افحص الماء', 'وزّع الأحمال', 'استبدل إذا قديم'],
    solutionsUr: ['تمام آلات نکالیں', 'بریکر ایک بار ری سیٹ کریں', 'دوبارہ ٹرپ ہو تو الیکٹریشن بلائیں', 'پانی چیک کریں', 'لوڈ تقسیم کریں', 'پرانا ہو تو بدلیں'],
    urgency: 'High'
  },
  {
    id: 'b-door-not-closing',
    category: 'Building',
    subCategory: 'Carpentry',
    title: 'Door Not Closing / Locking',
    titleAr: 'الباب لا يقفل',
    titleUr: 'دروازہ بند یا لاک نہیں ہو رہا',
    keywords: ['door', 'close', 'lock', 'stuck', 'door stuck', 'door not closing',
               'باب', 'قفل', 'لا يقفل', 'باب عالق',
               'دروازہ', 'لاک', 'بند نہیں', 'پھنس گیا'],
    causes: ['Warped door (humidity)', 'Loose hinges', 'Misaligned frame', 'Broken lock', 'Swollen wood', 'Damaged handle', 'Missing screws'],
    causesAr: ['انحناء الباب (رطوبة)', 'مفصلات مفكوكة', 'إطار غير متوازي', 'قفل مكسور', 'تورم الخشب', 'مقبض تالف', 'مسامير مفقودة'],
    causesUr: ['دروازہ ٹیڑھا (نمی)', 'ہینجز ڈھیلے', 'فریم ٹیڑھا', 'لاک ٹوٹا', 'لکڑی پھولی', 'ہینڈل خراب', 'اسکرو غائب'],
    solutions: ['Tighten hinge screws', 'Adjust strike plate', 'Plane/sand door edges', 'Replace lock', 'Use dehumidifier', 'Replace door if warped'],
    solutionsAr: ['شد مسامير المفصلات', 'عدّل صفيحة القفل', 'احك أو رمل حواف الباب', 'استبدل القفل', 'استخدم مزيل رطوبة', 'استبدل الباب إذا منحني'],
    solutionsUr: ['ہینج اسکرو سخت کریں', 'اسٹرائیک پلیٹ ایڈجسٹ کریں', 'دروازے کے کنارے رگڑیں', 'لاک بدلیں', 'ڈی ہیومیڈیفائر لگائیں', 'ٹیڑھا ہو تو بدلیں'],
    urgency: 'Medium'
  },
  {
    id: 'b-toilet-flush',
    category: 'Building',
    subCategory: 'Plumbing',
    title: 'Toilet Flush Not Working',
    titleAr: 'السيفون لا يعمل',
    titleUr: 'ٹوائلٹ فلش کام نہیں کر رہا',
    keywords: ['toilet', 'flush', 'not flushing', 'toilet flush',
               'سيفون', 'حمام', 'دورة مياه', 'طرد',
               'ٹوائلٹ', 'فلش', 'بیت الخلا'],
    causes: ['Broken flush button', 'Worn flapper valve', 'Low water level', 'Broken fill valve', 'Clogged drain', 'Chain disconnected', 'Broken handle'],
    causesAr: ['زر الطرد مكسور', 'صمام القلاب متآكل', 'مستوى الماء منخفض', 'صمام الملء تالف', 'انسداد التصريف', 'سلسلة مفصولة', 'مقبض مكسور'],
    causesUr: ['فلش بٹن ٹوٹا', 'فلیپر والو گھسا', 'پانی کی سطح کم', 'فل والو خراب', 'ڈرین بند', 'چین الگ', 'ہینڈل ٹوٹا'],
    solutions: ['Open tank, check flapper', 'Reconnect/replace chain', 'Replace flapper if worn', 'Adjust fill valve', 'Use plunger if clogged', 'Replace button'],
    solutionsAr: ['افتح الخزان، افحص القلاب', 'أعد توصيل السلسلة', 'استبدل القلاب إذا متآكل', 'عدّل صمام الملء', 'استخدم المكبس', 'استبدل الزر'],
    solutionsUr: ['ٹینک کھولیں، فلیپر چیک کریں', 'چین دوبارہ لگائیں', 'فلیپر بدلیں', 'فل والو ایڈجسٹ کریں', 'پلنجر استعمال کریں', 'بٹن بدلیں'],
    urgency: 'Medium'
  },
  {
    id: 'b-shower-leak',
    category: 'Building',
    subCategory: 'Plumbing',
    title: 'Shower Leaking',
    titleAr: 'الدش يسرّب',
    titleUr: 'شاور لیک ہو رہا',
    keywords: ['shower', 'leak', 'shower head', 'shower mixer',
               'دش', 'رشاش', 'تسريب دش', 'خلاط',
               'شاور', 'لیک', 'شاور ہیڈ'],
    causes: ['Worn shower head', 'Loose connection', 'Broken mixer', 'Damaged seal', 'Cracked hose', 'Faulty cartridge'],
    causesAr: ['رأس الدش متآكل', 'وصلة مفكوكة', 'خلاط مكسور', 'مانع تسرب تالف', 'خرطوم مشقوق', 'خرطوشة تالفة'],
    causesUr: ['شاور ہیڈ گھسا', 'کنکشن ڈھیلا', 'مکسر ٹوٹا', 'سیل خراب', 'ہوز پھٹی', 'کارٹریج خراب'],
    solutions: ['Tighten head connection', 'Apply Teflon tape', 'Replace hose if cracked', 'Replace cartridge', 'Replace head if damaged'],
    solutionsAr: ['شد وصلة الرأس', 'ضع شريط تفلون', 'استبدل الخرطوم إذا مشقوق', 'استبدل الخرطوشة', 'استبدل الرأس إذا تالف'],
    solutionsUr: ['ہیڈ کنکشن سخت کریں', 'ٹیفلون ٹیپ لگائیں', 'ہوز بدلیں', 'کارٹریج بدلیں', 'ہیڈ بدلیں'],
    urgency: 'Low'
  },
  {
    id: 'b-light-not-working',
    category: 'Building',
    subCategory: 'Electrical',
    title: 'Light Not Working',
    titleAr: 'اللمبة لا تعمل',
    titleUr: 'لائٹ کام نہیں کر رہی',
    keywords: ['light', 'lamp', 'not working', 'bulb', 'lighting',
               'لمبة', 'إضاءة', 'نور', 'ضوء',
               'لائٹ', 'بلب', 'روشنی', 'چراغ'],
    causes: ['Burnt out bulb', 'Blown fuse/breaker', 'Loose connection', 'Faulty switch', 'Broken wire', 'Damaged socket', 'Water in fixture'],
    causesAr: ['لمبة محروقة', 'فحم/قاطع محروق', 'وصلة مفكوكة', 'مفتاح تالف', 'سلك مقطوع', 'مقبس تالف', 'ماء في التركيب'],
    causesUr: ['بلب جل گیا', 'فیوز/بریکر ٹرپ', 'کنکشن ڈھیلا', 'سوئچ خراب', 'تار ٹوٹی', 'ساکٹ خراب', 'فکسچر میں پانی'],
    solutions: ['Replace bulb first', 'Check breaker panel', 'Check switch', 'Tighten connections', 'Check socket', 'Call electrician if wire issue'],
    solutionsAr: ['استبدل اللمبة أولاً', 'افحص لوحة القواطع', 'افحص المفتاح', 'شد الوصلات', 'افحص المقبس', 'اتصل بكهربائي إذا مشكلة أسلاك'],
    solutionsUr: ['پہلے بلب بدلیں', 'بریکر پینل چیک کریں', 'سوئچ چیک کریں', 'کنکشن سخت کریں', 'ساکٹ چیک کریں', 'تار کا مسئلہ ہو تو الیکٹریشن'],
    urgency: 'Low'
  },
  {
    id: 'b-fan-not-working',
    category: 'Building',
    subCategory: 'Electrical',
    title: 'Fan Not Working',
    titleAr: 'المروحة لا تعمل',
    titleUr: 'پنکھا کام نہیں کر رہا',
    keywords: ['fan', 'not working', 'ceiling fan', 'wall fan',
               'مروحة', 'لا تعمل', 'مروحة سقف',
               'پنکھا', 'چھت کا پنکھا', 'کام نہیں'],
    causes: ['Blown fuse', 'Broken pull chain', 'Worn motor', 'Bad capacitor', 'Loose wiring', 'Dust in motor'],
    causesAr: ['فحم محروق', 'سلسلة السحب مكسورة', 'موتور متآكل', 'مكثف تالف', 'أسلاك مفكوكة', 'غبار في الموتور'],
    causesUr: ['فیوز جل گیا', 'چین ٹوٹی', 'موٹر گھسی', 'کیپسیٹر خراب', 'وائرنگ ڈھیلی', 'موٹر میں دھول'],
    solutions: ['Check fuse', 'Check pull chain', 'Clean blades', 'Check capacitor', 'Replace fan if motor dead'],
    solutionsAr: ['افحص الفيوز', 'افحص سلسلة السحب', 'نظف الشفرات', 'افحص المكثف', 'استبدل المروحة إذا الموتور تالف'],
    solutionsUr: ['فیوز چیک کریں', 'چین چیک کریں', 'بلیڈ صاف کریں', 'کیپسیٹر چیک کریں', 'موٹر خراب ہو تو پنکھا بدلیں'],
    urgency: 'Low'
  },
  {
    id: 'b-water-pump',
    category: 'Building',
    subCategory: 'Plumbing',
    title: 'Water Pump Not Working',
    titleAr: 'المضخة لا تعمل',
    titleUr: 'واٹر پمپ کام نہیں کر رہا',
    keywords: ['pump', 'water pump', 'water pressure', 'no water',
               'مضخة', 'ماطور ماء', 'ضغط الماء',
               'پمپ', 'واٹر پمپ', 'پانی نہیں', 'دباؤ'],
    causes: ['Power issue', 'Motor burnt', 'Dry running', 'Faulty pressure switch', 'Clogged impeller', 'Air in system', 'Broken pipe'],
    causesAr: ['مشكلة كهرباء', 'الموتور محروق', 'تشغيل جاف', 'مفتاح الضغط تالف', 'انسداد المروحة الداخلية', 'هواء في النظام', 'أنبوب مكسور'],
    causesUr: ['بجلی کا مسئلہ', 'موٹر جل گئی', 'خشک چل رہا', 'پریشر سوئچ خراب', 'امپیلر بند', 'سسٹم میں ہوا', 'پائپ ٹوٹا'],
    solutions: ['Check power', 'Check water level', 'Reset pressure switch', 'Prime if dry', 'Call plumber for motor'],
    solutionsAr: ['افحص الكهرباء', 'افحص مستوى الماء', 'أعد ضبط مفتاح الضغط', 'أضف ماء إذا جاف', 'استدع سباك إذا الموتور'],
    solutionsUr: ['بجلی چیک کریں', 'پانی کی سطح چیک کریں', 'پریشر سوئچ ری سیٹ کریں', 'خشک ہو تو پرائم کریں', 'موٹر کے لیے پلمبر'],
    urgency: 'High'
  },
  {
    id: 'b-wall-crack',
    category: 'Building',
    subCategory: 'Civil',
    title: 'Wall Cracks',
    titleAr: 'تشققات في الجدار',
    titleUr: 'دیوار میں دراڑیں',
    keywords: ['crack', 'wall crack', 'wall damage', 'cracks',
               'تشقق', 'جدار', 'شق', 'تصدع',
               'دراڑ', 'دیوار', 'شگاف'],
    causes: ['Settlement', 'Moisture damage', 'Poor plaster', 'Structural issue', 'Thermal expansion', 'Water infiltration'],
    causesAr: ['هبوط التربة', 'تلف من الرطوبة', 'بلاستر رديء', 'مشكلة إنشائية', 'تمدد حراري', 'تسرب الماء'],
    causesUr: ['زمین بیٹھنا', 'نمی سے نقصان', 'پلاسٹر خراب', 'ساختی مسئلہ', 'درجہ حرارت پھیلاؤ', 'پانی کا رساؤ'],
    solutions: ['Small cracks: sealant', 'Large cracks: consult engineer', 'Check water source', 'Repaint after repair', 'Monitor if growing'],
    solutionsAr: ['شقوق صغيرة: مانع تسرب', 'شقوق كبيرة: استشر مهندس', 'افحص مصدر الماء', 'أعد الدهان بعد الإصلاح', 'راقب إذا تكبر'],
    solutionsUr: ['چھوٹی دراڑ: سیلنٹ', 'بڑی دراڑ: انجینئر سے پوچھیں', 'پانی کا ذریعہ چیک کریں', 'ٹھیک کے بعد پینٹ کریں', 'بڑھے تو مانیٹر'],
    urgency: 'High'
  },
  {
    id: 'b-mold',
    category: 'Building',
    subCategory: 'Civil',
    title: 'Mold on Walls',
    titleAr: 'عفن على الجدران',
    titleUr: 'دیواروں پر پھپھوندی',
    keywords: ['mold', 'mildew', 'mould', 'damp',
               'عفن', 'رطوبة جدار', 'عطن',
               'پھپھوندی', 'نم', 'سیاہ داغ'],
    causes: ['Excess humidity', 'Water leak', 'Poor ventilation', 'AC dripping', 'Condensation', 'Leaking roof'],
    causesAr: ['رطوبة عالية', 'تسريب ماء', 'تهوية سيئة', 'تكثيف المكيف', 'تكاثف', 'تسريب السطح'],
    causesUr: ['زیادہ نمی', 'پانی کا رساؤ', 'وینٹیلیشن خراب', 'اے سی ٹپک رہا', 'کنڈینسیشن', 'چھت لیک'],
    solutions: ['Clean with bleach', 'Find & fix water source', 'Improve ventilation', 'Use dehumidifier', 'Anti-mold paint'],
    solutionsAr: ['نظف بالكلور', 'حدد وأصلح مصدر الماء', 'حسّن التهوية', 'استخدم مزيل رطوبة', 'دهان مضاد للعفن'],
    solutionsUr: ['بلیچ سے صاف کریں', 'پانی کا ذریعہ ٹھیک کریں', 'وینٹیلیشن بہتر کریں', 'ڈی ہیومیڈیفائر لگائیں', 'اینٹی مولڈ پینٹ'],
    urgency: 'Medium'
  },
  {
    id: 'b-drain-clog',
    category: 'Building',
    subCategory: 'Plumbing',
    title: 'Drain Clogged',
    titleAr: 'المجاري مسدودة',
    titleUr: 'ڈرین بند',
    keywords: ['drain', 'clog', 'blocked', 'drain clog', 'sink clogged',
               'مجرى', 'مسدود', 'بالوعة', 'مغسلة',
               'ڈرین', 'بند', 'نالی', 'سنک'],
    causes: ['Hair buildup', 'Grease', 'Food waste', 'Foreign objects', 'Root intrusion', 'Soap scum'],
    causesAr: ['تراكم الشعر', 'شحم', 'فضلات طعام', 'أجسام غريبة', 'اختراق الجذور', 'صابون مترسب'],
    causesUr: ['بال کی جمع', 'چربی', 'کھانے کا فضلہ', 'اجنبی اشیاء', 'جڑیں', 'صابن کی تہ'],
    solutions: ['Use plunger', 'Drain cleaner', 'Drain snake', 'Remove visible blockage', 'Call plumber if persistent'],
    solutionsAr: ['استخدم المكبس', 'منظف المجاري', 'سلك التنظيف', 'أزل الانسداد الظاهر', 'استدع سباك إذا استمر'],
    solutionsUr: ['پلنجر استعمال کریں', 'ڈرین کلینر', 'ڈرین سنیک', 'نظر آنے والا بلاکیج ہٹائیں', 'پلمبر بلائیں'],
    urgency: 'Medium'
  },
  {
    id: 'b-hot-water',
    category: 'Building',
    subCategory: 'Plumbing',
    title: 'No Hot Water',
    titleAr: 'لا يوجد ماء ساخن',
    titleUr: 'گرم پانی نہیں آ رہا',
    keywords: ['hot water', 'water heater', 'no hot water', 'boiler',
               'ماء ساخن', 'سخان', 'بدون ماء ساخن',
               'گرم پانی', 'واٹر ہیٹر', 'بوائلر'],
    causes: ['Heater not powered', 'Thermostat issue', 'Heating element failed', 'Gas supply issue', 'Pilot light off', 'Sediment buildup'],
    causesAr: ['السخان بدون كهرباء', 'مشكلة الترموستات', 'تلف عنصر التسخين', 'مشكلة الغاز', 'الشعلة مطفأة', 'تراكم الرواسب'],
    causesUr: ['ہیٹر بجلی سے نہیں', 'تھرموسٹیٹ مسئلہ', 'ہیٹنگ ایلیمنٹ خراب', 'گیس کی فراہمی مسئلہ', 'پائلٹ لائٹ بند', 'تلچھٹ جمع'],
    solutions: ['Check power/gas', 'Check thermostat setting', 'Relight pilot', 'Reset heater', 'Call technician'],
    solutionsAr: ['افحص الكهرباء/الغاز', 'افحص إعداد الترموستات', 'أعد إشعال الشعلة', 'أعد ضبط السخان', 'اتصل بفني'],
    solutionsUr: ['بجلی/گیس چیک کریں', 'تھرموسٹیٹ سیٹنگ چیک کریں', 'پائلٹ دوبارہ جلائیں', 'ہیٹر ری سیٹ کریں', 'ٹیکنیشن بلائیں'],
    urgency: 'Medium'
  }
];

// ===== SMART AUTO-CLASSIFICATION =====
export function classifyIssue(text) {
  if (!text || text.trim().length < 2) return null;
  const q = text.toLowerCase().trim();
  const qWords = q.split(/\s+/).filter(w => w.length > 1);

  let best = null;
  let bestScore = 0;

  for (const entry of KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of entry.keywords) {
      const k = kw.toLowerCase();
      if (q.includes(k)) score += k.length; // longer match = higher score
      else {
        for (const word of qWords) {
          if (k.includes(word) || word.includes(k)) score += 2;
        }
      }
    }
    if (entry.title.toLowerCase().includes(q)) score += 20;
    if (entry.titleAr.includes(q)) score += 20;
    if (entry.titleUr.includes(q)) score += 20;

    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (!best || bestScore < 3) return null;
  return { ...best, confidence: Math.min(bestScore * 5, 100) };
}

// Search with all languages
export function searchKnowledge(query) {
  const result = classifyIssue(query);
  if (!result) return [];
  return [result];
}

// Get language-specific content
export function getLocalized(entry, lang) {
  if (!entry) return null;
  if (lang === 'ar') {
    return {
      title: entry.titleAr || entry.title,
      causes: entry.causesAr || entry.causes,
      solutions: entry.solutionsAr || entry.solutions
    };
  }
  if (lang === 'ur') {
    return {
      title: entry.titleUr || entry.title,
      causes: entry.causesUr || entry.causes,
      solutions: entry.solutionsUr || entry.solutions
    };
  }
  return {
    title: entry.title,
    causes: entry.causes,
    solutions: entry.solutions
  };
}
