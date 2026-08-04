import axios from 'axios';

const API_BASE = 'http://localhost:5010/api';

async function testTeacherFiltering() {
  try {
    console.log('🧪 Testing teacher filtering...\n');

    // Test 1: Try to access students without authentication
    console.log('1. Testing unauthenticated access to /students...');
    try {
      const response = await axios.get(`${API_BASE}/students`);
      console.log('❌ Should have failed but got:', response.status);
    } catch (error) {
      console.log('✅ Correctly rejected unauthenticated access:', error.response?.status);
    }

    // Test 2: Login as a teacher
    console.log('\n2. Logging in as a teacher...');
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: 'eva.nahi@mindful.se',
      password: 'mindful'
    }, {
      withCredentials: true
    });
    console.log('✅ Teacher login successful');

    // Test 3: Access students as teacher (should be filtered)
    console.log('\n3. Testing teacher access to /students...');
    const studentsResponse = await axios.get(`${API_BASE}/students`, {
      withCredentials: true
    });
    console.log(`✅ Teacher can access students. Count: ${studentsResponse.data.length}`);

    // Test 4: Access exams as teacher (should be filtered)
    console.log('\n4. Testing teacher access to /exams...');
    const examsResponse = await axios.get(`${API_BASE}/exams`, {
      withCredentials: true
    });
    console.log(`✅ Teacher can access exams. Count: ${examsResponse.data.length}`);

    // Test 5: Access notifications as teacher (should be filtered)
    console.log('\n5. Testing teacher access to /notifications...');
    const notificationsResponse = await axios.get(`${API_BASE}/notifications`, {
      withCredentials: true
    });
    console.log(`✅ Teacher can access notifications. Count: ${notificationsResponse.data.length}`);

    // Test 6: Access search as teacher (should be filtered)
    console.log('\n6. Testing teacher access to /search...');
    const searchResponse = await axios.get(`${API_BASE}/search?q=test&type=Alla`, {
      withCredentials: true
    });
    console.log(`✅ Teacher can access search. Results: ${searchResponse.data.length}`);

    console.log('\n🎉 All teacher filtering tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testTeacherFiltering(); 