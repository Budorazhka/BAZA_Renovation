import axios from 'axios';

const BASE_URL = 'https://api-crm.baza.sale';
const AUTH_URL = `${BASE_URL}/auth/login-direct`;
const LMS_API_URL = `${BASE_URL}/api/lms`;

const credentials = {
  email: 'ek9705946@icloud.com',
  password: 'PoRoRo123'
};

async function verify() {
  console.log('--- Starting LMS Backend Verification ---');

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
      console.log(`✅ ${label}: Envelope format correct`);
      return true;
    } else {
      console.error(`❌ ${label}: Envelope format incorrect`, res.data);
      return false;
    }
  };

  let testItemId;
  let testCourseId;

  // --- ITEMS ---
  console.log('\n--- Testing Items ---');
  
  // GET Items
  try {
    const res = await api.get('/api/lms/items');
    checkEnvelope(res, 'GET /api/lms/items');
    console.log(`   Found ${res.data.data.length} items`);
  } catch (error) {
    console.error('❌ GET /api/lms/items failed:', error.response?.data || error.message);
  }

  // POST Item
  const newItem = {
    type: 'article',
    title: 'Test Article',
    description: 'A test article created during verification',
    targetRole: 'all',
    readTime: '1 мин',
    tags: ['test'],
    content: {
      type: 'article',
      body: 'This is a test article content in markdown.'
    }
  };

  try {
    const res = await api.post('/api/lms/items', newItem);
    if (checkEnvelope(res, 'POST /api/lms/items')) {
      testItemId = res.data.data.id || res.data.data._id;
      console.log(`   Created item ID: ${testItemId}`);
    }
  } catch (error) {
    console.error('❌ POST /api/lms/items failed:', error.response?.data || error.message);
  }

  // PATCH Item
  if (testItemId) {
    try {
      const res = await api.patch(`/api/lms/items/${testItemId}`, { title: 'Updated Test Article' });
      if (checkEnvelope(res, `PATCH /api/lms/items/${testItemId}`)) {
        console.log(`   Updated item title: ${res.data.data.title}`);
      }
    } catch (error) {
      console.error('❌ PATCH /api/lms/items failed:', error.response?.data || error.message);
    }
  }

  // --- COURSES ---
  console.log('\n--- Testing Courses ---');

  // GET Courses
  try {
    const res = await api.get('/api/lms/courses');
    checkEnvelope(res, 'GET /api/lms/courses');
    console.log(`   Found ${res.data.data.length} courses`);
  } catch (error) {
    console.error('❌ GET /api/lms/courses failed:', error.response?.data || error.message);
  }

  // POST Course
  const newCourse = {
    title: 'Test Course',
    description: 'A test course created during verification',
    targetRoles: ['manager'],
    emoji: '🧪',
    itemIds: testItemId ? [testItemId] : []
  };

  try {
    const res = await api.post('/api/lms/courses', newCourse);
    if (checkEnvelope(res, 'POST /api/lms/courses')) {
      testCourseId = res.data.data.id || res.data.data._id;
      console.log(`   Created course ID: ${testCourseId}`);
    }
  } catch (error) {
    console.error('❌ POST /api/lms/courses failed:', error.response?.data || error.message);
  }

  // PATCH Course
  if (testCourseId) {
    try {
      const res = await api.patch(`/api/lms/courses/${testCourseId}`, { emoji: '🔬' });
      if (checkEnvelope(res, `PATCH /api/lms/courses/${testCourseId}`)) {
        console.log(`   Updated course emoji: ${res.data.data.emoji}`);
      }
    } catch (error) {
      console.error('❌ PATCH /api/lms/courses failed:', error.response?.data || error.message);
    }
  }

  // --- PROGRESS ---
  console.log('\n--- Testing Progress ---');

  // GET Progress
  try {
    const res = await api.get('/api/lms/progress');
    checkEnvelope(res, 'GET /api/lms/progress');
    console.log(`   Found progress entries for ${Object.keys(res.data.data).length} courses`);
  } catch (error) {
    console.error('❌ GET /api/lms/progress failed:', error.response?.data || error.message);
  }

  // PUT Progress
  if (testCourseId) {
    const progressEntry = {
      completedItems: testItemId ? [testItemId] : [],
      finalQuizPassed: false,
      finalQuizScore: 0
    };

    try {
      const res = await api.put(`/api/lms/progress/${testCourseId}`, progressEntry);
      if (checkEnvelope(res, `PUT /api/lms/progress/${testCourseId}`)) {
        console.log(`   Updated progress for course: ${testCourseId}`);
      }
    } catch (error) {
      console.error('❌ PUT /api/lms/progress failed:', error.response?.data || error.message);
    }
  }

  // --- CLEANUP (DELETE) ---
  console.log('\n--- Cleanup (DELETE) ---');

  if (testCourseId) {
    try {
      const res = await api.delete(`/api/lms/progress/${testCourseId}`);
      if (checkEnvelope(res, `DELETE /api/lms/progress/${testCourseId}`)) {
        console.log(`   Deleted progress for course: ${testCourseId}`);
      }
    } catch (error) {
      console.error('❌ DELETE /api/lms/progress failed:', error.response?.data || error.message);
    }

    try {
      const res = await api.delete(`/api/lms/courses/${testCourseId}`);
      if (checkEnvelope(res, `DELETE /api/lms/courses/${testCourseId}`)) {
        console.log(`   Deleted course: ${testCourseId}`);
      }
    } catch (error) {
      console.error('❌ DELETE /api/lms/courses failed:', error.response?.data || error.message);
    }
  }

  if (testItemId) {
    try {
      const res = await api.delete(`/api/lms/items/${testItemId}`);
      if (checkEnvelope(res, `DELETE /api/lms/items/${testItemId}`)) {
        console.log(`   Deleted item: ${testItemId}`);
      }
    } catch (error) {
      console.error('❌ DELETE /api/lms/items failed:', error.response?.data || error.message);
    }
  }

  console.log('\n--- Verification Finished ---');
}

verify();
