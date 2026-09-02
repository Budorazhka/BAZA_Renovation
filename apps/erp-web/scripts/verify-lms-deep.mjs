import axios from 'axios';

const BASE_URL = 'https://api-crm.baza.sale';
const AUTH_URL = `${BASE_URL}/auth/login-direct`;

const credentials = {
  email: 'ek9705946@icloud.com',
  password: 'PoRoRo123'
};

async function verify() {
  console.log('--- Starting Deep LMS Backend Verification ---');

  // 1. Login
  let token;
  try {
    const loginRes = await axios.post(AUTH_URL, credentials);
    token = loginRes.data.token;
    console.log('✅ Login successful');
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return;
  }

  const api = axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  const checkEnvelope = (res, label) => {
    if (res.data && res.data.success === true && res.data.data !== undefined) {
      return true;
    } else {
      console.error(`❌ ${label}: Envelope format incorrect`, res.data);
      return false;
    }
  };

  const validateFields = (obj, fields, label) => {
    const missing = fields.filter(f => obj[f] === undefined);
    if (missing.length === 0) {
      console.log(`✅ ${label}: All fields present (${fields.join(', ')})`);
      return true;
    } else {
      console.error(`❌ ${label}: Missing fields: ${missing.join(', ')}`);
      return false;
    }
  };

  let testItemId;
  let testCourseId;

  // --- 1. POST ITEM (Detailed) ---
  const newItem = {
    type: 'quiz',
    title: 'Complex Quiz',
    description: 'A quiz with multiple questions',
    targetRole: 'manager',
    readTime: '10 мин',
    tags: ['sales', 'test'],
    content: {
      type: 'quiz',
      questions: [
        { question: 'Q1', options: ['O1', 'O2'], correct: 0 },
        { question: 'Q2', options: ['A', 'B', 'C'], correct: 2 }
      ]
    }
  };

  console.log('\n--- 1. Testing Item Model ---');
  try {
    const res = await api.post('/api/lms/items', newItem);
    if (checkEnvelope(res, 'POST /api/lms/items')) {
      const item = res.data.data;
      testItemId = item.id || item._id;
      validateFields(item, ['id', 'type', 'title', 'description', 'targetRole', 'content'], 'Item fields');
      
      if (item.content && item.content.type === 'quiz' && item.content.questions?.length === 2) {
        console.log('✅ Item content: correctly saved');
      } else {
        console.error('❌ Item content: mismatch', item.content);
      }
    }
  } catch (error) {
    console.error('❌ POST /api/lms/items failed:', error.response?.data || error.message);
  }

  // --- 2. POST COURSE (Detailed) ---
  const newCourse = {
    title: 'Complex Course',
    description: 'Course with quiz and items',
    targetRoles: ['manager', 'rop'],
    emoji: '🎓',
    itemIds: testItemId ? [testItemId] : [],
    finalQuiz: {
      passingScore: 80,
      questions: [
        { question: 'Final Q', options: ['Yes', 'No'], correct: 0 }
      ]
    }
  };

  console.log('\n--- 2. Testing Course Model ---');
  try {
    const res = await api.post('/api/lms/courses', newCourse);
    if (checkEnvelope(res, 'POST /api/lms/courses')) {
      const course = res.data.data;
      testCourseId = course.id || course._id;
      validateFields(course, ['id', 'title', 'description', 'targetRoles', 'emoji', 'itemIds'], 'Course fields');
      
      if (course.finalQuiz && course.finalQuiz.passingScore === 80) {
        console.log('✅ Course finalQuiz: correctly saved');
      } else if (newCourse.finalQuiz) {
        console.error('❌ Course finalQuiz: mismatch or missing', course.finalQuiz);
      }

      if (Array.isArray(course.targetRoles) && course.targetRoles.includes('rop')) {
        console.log('✅ Course targetRoles: correctly saved');
      } else {
        console.error('❌ Course targetRoles: mismatch', course.targetRoles);
      }
    }
  } catch (error) {
    console.error('❌ POST /api/lms/courses failed:', error.response?.data || error.message);
  }

  // --- 3. PROGRESS (Detailed) ---
  console.log('\n--- 3. Testing Progress Model ---');
  if (testCourseId) {
    const progressEntry = {
      completedItems: [testItemId],
      finalQuizPassed: true,
      finalQuizScore: 90
    };

    try {
      const res = await api.put(`/api/lms/progress/${testCourseId}`, progressEntry);
      if (checkEnvelope(res, `PUT /api/lms/progress/${testCourseId}`)) {
        const entry = res.data.data;
        validateFields(entry, ['completedItems', 'finalQuizPassed', 'finalQuizScore'], 'Progress fields');
        console.log('✅ Progress data: correctly saved');
      }
    } catch (error) {
      console.error('❌ PUT /api/lms/progress failed:', error.response?.data || error.message);
    }

    try {
      const res = await api.get('/api/lms/progress');
      if (checkEnvelope(res, 'GET /api/lms/progress')) {
        const progressMap = res.data.data;
        if (progressMap[testCourseId]) {
          console.log(`✅ GET progress: Found entry for course ${testCourseId}`);
        } else {
          console.error(`❌ GET progress: Entry for ${testCourseId} missing in map`);
        }
      }
    } catch (error) {
      console.error('❌ GET /api/lms/progress failed:', error.response?.data || error.message);
    }
  }

  // --- CLEANUP ---
  console.log('\n--- 4. Cleanup ---');
  if (testCourseId) {
    await api.delete(`/api/lms/progress/${testCourseId}`).catch(() => {});
    await api.delete(`/api/lms/courses/${testCourseId}`).catch(() => {});
    console.log('✅ Course and progress cleaned up');
  }
  if (testItemId) {
    await api.delete(`/api/lms/items/${testItemId}`).catch(() => {});
    console.log('✅ Item cleaned up');
  }

  console.log('\n--- Deep Verification Finished ---');
}

verify();
