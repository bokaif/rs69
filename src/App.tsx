import React, { useState } from 'react';
import { Icon } from '@iconify/react';

// Import JSON data
import classesData from '../classes.json';
import diningData from '../dining.json';

// Google Calendar types
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

interface ClassInfo {
  subject: string;
  faculty: string;
  room: string;
  section: string;
}

interface MealInfo {
  meal: string;
  timeRange: string;
}

interface TimeSlot {
  time: string;
  type: 'class' | 'meal';
  sunday?: ClassInfo | MealInfo;
  monday?: ClassInfo | MealInfo;
  tuesday?: ClassInfo | MealInfo;
  wednesday?: ClassInfo | MealInfo;
  thursday?: ClassInfo | MealInfo;
  friday?: ClassInfo | MealInfo;
  saturday?: ClassInfo | MealInfo;
}

function App() {
  const [currentView, setCurrentView] = useState<'input' | 'schedule'>('input');
  const [selectedSection, setSelectedSection] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [schedule, setSchedule] = useState<TimeSlot[]>([]);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Google Calendar configuration
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
  const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
  const SCOPES = 'https://www.googleapis.com/auth/calendar';

  // Check if Google Calendar credentials are configured
  const isGoogleConfigured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_API_KEY);

  // Helper function to convert time string to minutes for proper sorting
  const timeToMinutes = (timeStr: string): number => {
    const time = timeStr.split('-')[0].trim(); // Get start time
    const [timePart, period] = time.split(/([AP]M)/);
    const [hours, minutes] = timePart.split('.').map(Number);
    
    let totalMinutes = (hours % 12) * 60 + (minutes || 0);
    if (period === 'PM') totalMinutes += 12 * 60;
    
    return totalMinutes;
  };

  // Initialize Google API
  const initializeGapi = async () => {
    if (typeof window !== 'undefined' && window.gapi) {
      await window.gapi.load('auth2', () => {
        window.gapi.auth2.init({
          client_id: GOOGLE_CLIENT_ID,
        });
      });
      
      await window.gapi.load('client', async () => {
        await window.gapi.client.init({
          apiKey: GOOGLE_API_KEY,
          clientId: GOOGLE_CLIENT_ID,
          discoveryDocs: [DISCOVERY_DOC],
          scope: SCOPES
        });
        
        const authInstance = window.gapi.auth2.getAuthInstance();
        setIsGoogleSignedIn(authInstance.isSignedIn.get());
      });
    }
  };

  // Sign in to Google
  const signInToGoogle = async () => {
    if (!window.gapi) {
      alert('Google API not loaded. Please refresh the page and try again.');
      return;
    }
    
    try {
      const authInstance = window.gapi.auth2.getAuthInstance();
      await authInstance.signIn();
      setIsGoogleSignedIn(true);
    } catch (error) {
      console.error('Error signing in to Google:', error);
      alert('Failed to sign in to Google. Please try again.');
    }
  };

  // Convert time string to Date object
  const parseTimeToDate = (timeStr: string, dayOffset: number): { start: Date; end: Date } => {
    const [startTime, endTime] = timeStr.split('-');
    const today = new Date();
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay())); // Get Sunday
    
    const parseTime = (time: string, date: Date) => {
      const [timePart, period] = time.trim().split(/([AP]M)/);
      const [hours, minutes] = timePart.split('.').map(Number);
      
      let hour = parseInt(hours.toString());
      if (period === 'PM' && hour !== 12) hour += 12;
      if (period === 'AM' && hour === 12) hour = 0;
      
      date.setHours(hour, minutes || 0, 0, 0);
      return new Date(date);
    };
    
    const eventDate = new Date(startOfWeek);
    eventDate.setDate(startOfWeek.getDate() + dayOffset);
    
    const start = parseTime(startTime, new Date(eventDate));
    const end = parseTime(endTime, new Date(eventDate));
    
    return { start, end };
  };

  // Export schedule to Google Calendar
  const exportToGoogleCalendar = async () => {
    if (!isGoogleSignedIn) {
      await signInToGoogle();
      return;
    }

    setIsExporting(true);
    
    try {
      const events = [];
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      
      for (const slot of schedule) {
        for (let dayIndex = 0; dayIndex < dayNames.length; dayIndex++) {
          const dayName = dayNames[dayIndex] as keyof TimeSlot;
          const item = slot[dayName] as ClassInfo | MealInfo | undefined;
          
          if (item) {
            const { start, end } = parseTimeToDate(slot.time, dayIndex);
            
            let eventTitle = '';
            let eventDescription = '';
            let eventLocation = '';
            
            if ('subject' in item) {
              // Class event
              eventTitle = `${item.subject} - Class`;
              eventDescription = `Instructor: ${item.faculty}\nSection: ${item.section}`;
              eventLocation = `Room ${item.room}`;
            } else {
              // Meal event
              eventTitle = item.meal;
              eventDescription = `Dining time: ${item.timeRange}`;
              eventLocation = 'Dining Hall';
            }
            
            events.push({
              summary: eventTitle,
              description: eventDescription,
              location: eventLocation,
              start: {
                dateTime: start.toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
              end: {
                dateTime: end.toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
              recurrence: ['RRULE:FREQ=WEEKLY;COUNT=16'], // Repeat for 16 weeks (semester)
            });
          }
        }
      }
      
      // Create events in Google Calendar
      const batch = window.gapi.client.newBatch();
      
      events.forEach(event => {
        const request = window.gapi.client.calendar.events.insert({
          calendarId: 'primary',
          resource: event
        });
        batch.add(request);
      });
      
              
       await batch.then((response: any) => {
        console.log('Events created successfully:', response);
        alert(`Successfully exported ${events.length} events to your Google Calendar!`);
      });
      
    } catch (error) {
      console.error('Error exporting to Google Calendar:', error);
      alert('Failed to export to Google Calendar. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Load Google API script
  React.useEffect(() => {
    if (currentView === 'schedule') {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = initializeGapi;
      document.body.appendChild(script);
      
      return () => {
        document.body.removeChild(script);
      };
    }
  }, [currentView]);

  // Process classes data for a specific section
  const getClassSchedule = (sectionIndex: number): TimeSlot[] => {
    const classSlots: TimeSlot[] = [];
    
    classesData.patterns.forEach(pattern => {
      pattern.assignments.forEach(assignment => {
        if (assignment.section === sectionIndex) {
          const timeSlot = classesData.slots[assignment.slot];
          const subject = classesData.subjects[assignment.subject];
          const faculty = classesData.faculties[assignment.faculty];
          const room = classesData.rooms[assignment.room];
          const section = classesData.sections[assignment.section];

          const classInfo: ClassInfo = {
            subject,
            faculty,
            room,
            section
          };

          // Find existing time slot or create new one
          let existingSlot = classSlots.find(slot => slot.time === timeSlot);
          if (!existingSlot) {
            existingSlot = {
              time: timeSlot,
              type: 'class'
            };
            classSlots.push(existingSlot);
          }

          // Add class to appropriate days
          pattern.days.forEach(dayIndex => {
            const dayName = classesData.days[dayIndex].toLowerCase() as keyof TimeSlot;
            if (dayName !== 'time' && dayName !== 'type') {
              (existingSlot as TimeSlot)[dayName] = classInfo;
            }
          });
        }
      });
    });

    return classSlots;
  };

  // Process dining data
  const getDiningSchedule = (): TimeSlot[] => {
    const diningSlots: TimeSlot[] = [];
    
    diningData.patterns.forEach(pattern => {
      pattern.slots.forEach(slotIndex => {
        const timeRange = diningData.timeRanges[slotIndex];
        const mealIndex = pattern.slots.indexOf(slotIndex);
        const meal = diningData.meals[mealIndex] || diningData.meals[0];
        
        const mealInfo: MealInfo = {
          meal,
          timeRange
        };

        // Find existing time slot or create new one
        let existingSlot = diningSlots.find(slot => slot.time === timeRange);
        if (!existingSlot) {
          existingSlot = {
            time: timeRange,
            type: 'meal'
          };
          diningSlots.push(existingSlot);
        }

        // Add meal to appropriate days
        pattern.days.forEach(dayIndex => {
          const dayName = diningData.days[dayIndex].toLowerCase() as keyof TimeSlot;
          if (dayName !== 'time' && dayName !== 'type') {
            (existingSlot as TimeSlot)[dayName] = mealInfo;
          }
        });
      });
    });

    return diningSlots;
  };

  // Combine class and dining schedules with proper sorting
  const getCombinedSchedule = (sectionIndex: number): TimeSlot[] => {
    const classSchedule = getClassSchedule(sectionIndex);
    const diningSchedule = getDiningSchedule();
    
    return [...classSchedule, ...diningSchedule].sort((a, b) => {
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    });
  };

  const handleSectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSection.trim()) return;
    
    setIsLoading(true);
    
    // Find section index
    const sectionIndex = classesData.sections.findIndex(section => 
      section.toLowerCase() === selectedSection.toLowerCase()
    );
    
    if (sectionIndex === -1) {
      alert('Section not found! Please try a valid section like S01, S02, etc.');
      setIsLoading(false);
      return;
    }

    // Generate schedule
    const combinedSchedule = getCombinedSchedule(sectionIndex);
    setSchedule(combinedSchedule);
    
    await new Promise(resolve => setTimeout(resolve, 800));
    setIsLoading(false);
    setCurrentView('schedule');
  };

  const getMealTypeColor = (meal: string) => {
    switch (meal) {
      case 'Breakfast': return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
      case 'Lunch': return 'bg-orange-500/20 text-orange-300 border border-orange-500/30';
      case 'Dinner': return 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
      default: return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
    }
  };

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (currentView === 'input') {
    return (
      <div className="min-h-screen bg-gray-900 relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-green-600/10 to-violet-600/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-amber-600/10 to-green-600/10 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 container mx-auto px-6 py-20">
          <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-500 to-violet-600 rounded-3xl mb-8 shadow-2xl shadow-green-500/25">
                <Icon icon="solar:calendar-bold-duotone" className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent mb-6">
                RS Routine Viewer
              </h1>
              <p className="text-xl text-gray-400 leading-relaxed max-w-lg mx-auto">
                Enter your section to view your complete weekly routine with classes and dining schedules
              </p>
            </div>

            {/* Input Form */}
            <div className="bg-gray-700/50 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden">
              <div className="p-10">
                <form onSubmit={handleSectionSubmit} className="space-y-8">
                  <div>
                    <label htmlFor="section" className="block text-sm font-semibold text-gray-300 mb-4">
                      Section Code
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="section"
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value.toUpperCase())}
                        placeholder="e.g., S01, S02, S03"
                        className="w-full px-6 py-5 pl-14 text-lg bg-gray-800/50 text-white placeholder-gray-500 rounded-2xl focus:ring-2 focus:ring-green-500/50 focus:bg-gray-800/70 transition-all duration-300 backdrop-blur-sm"
                        disabled={isLoading}
                      />
                      <Icon icon="solar:magnifer-bold-duotone" className="absolute left-5 top-1/2 transform -translate-y-1/2 w-6 h-6 text-gray-400" />
                    </div>
                    <p className="mt-3 text-sm text-gray-500">
                      Enter your section code (S01 - S53)
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={!selectedSection.trim() || isLoading}
                    className="w-full bg-gradient-to-r from-green-600 to-violet-600 hover:from-green-700 hover:to-violet-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-semibold py-5 px-8 rounded-2xl transition-all duration-300 flex items-center justify-center space-x-3 shadow-lg hover:shadow-xl hover:shadow-green-500/25"
                  >
                    {isLoading ? (
                      <>
                        <Icon icon="solar:refresh-bold-duotone" className="w-6 h-6 animate-spin" />
                        <span>Loading Schedule...</span>
                      </>
                    ) : (
                      <>
                        <Icon icon="solar:calendar-search-bold-duotone" className="w-6 h-6" />
                        <span>View My Routine</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Features */}
              <div className="bg-gray-800/30 px-10 py-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex items-center space-x-4">
                    <Icon icon="solar:book-bold-duotone" className="w-6 h-6 text-green-400" />
                    <span className="text-sm text-gray-300 font-medium">Class Schedule</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <Icon icon="solar:cup-hot-bold-duotone" className="w-6 h-6 text-amber-400" />
                    <span className="text-sm text-gray-300 font-medium">Dining Times</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <Icon icon="logos:google-calendar" className="w-6 h-6" />
                    <span className="text-sm text-gray-300 font-medium">Calendar Export</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sample Sections */}
            <div className="mt-12 text-center">
              <p className="text-sm text-gray-500 mb-6">Try these sample sections:</p>
              <div className="flex flex-wrap justify-center gap-3">
                {['S01', 'S02', 'S03', 'S10', 'S25'].map((section) => (
                  <button
                    key={section}
                    onClick={() => setSelectedSection(section)}
                    className="px-5 py-2 text-sm bg-gray-800/50 text-gray-300 rounded-xl hover:bg-gray-700/50 hover:text-white transition-all duration-200 backdrop-blur-sm"
                  >
                    {section}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800/50 backdrop-blur-xl sticky top-0 z-10 flex-shrink-0">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <button
                onClick={() => setCurrentView('input')}
                className="flex items-center space-x-3 text-gray-400 hover:text-white transition-colors duration-200 group"
              >
                <Icon icon="solar:arrow-left-bold-duotone" className="w-6 h-6 group-hover:-translate-x-1 transition-transform duration-200" />
                <span className="font-medium">Back</span>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white">Weekly Routine</h1>
                <p className="text-sm text-gray-400 mt-1">Section: <span className="text-green-400 font-medium">{selectedSection}</span></p>
              </div>
            </div>
            
            {/* Google Calendar Export Button */}
            {isGoogleConfigured ? (
              <button
                onClick={exportToGoogleCalendar}
                disabled={isExporting}
                className="flex items-center space-x-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium px-6 py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                {isExporting ? (
                  <>
                    <Icon icon="solar:refresh-bold-duotone" className="w-5 h-5 animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <Icon icon="logos:google-calendar" className="w-5 h-5" />
                    <span>{isGoogleSignedIn ? 'Export to Calendar' : 'Connect Google Calendar'}</span>
                  </>
                )}
              </button>
            ) : (
              <></>
            )}
          </div>
        </div>
      </div>

      {/* Schedule Table - Full Height */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full bg-gray-800/30 backdrop-blur-xl">
          <div className="h-full overflow-auto">
            <table className="w-full h-full">
              <thead className="bg-gray-700/50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-200 w-32">
                    <div className="flex items-center space-x-2">
                      <Icon icon="solar:clock-circle-bold-duotone" className="w-4 h-4 text-green-400" />
                      <span>Time</span>
                    </div>
                  </th>
                  {dayLabels.map((day) => (
                    <th key={day} className="px-4 py-4 text-center text-sm font-bold text-gray-200">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/30">
                {schedule.map((slot, index) => (
                  <tr key={index} className="hover:bg-gray-700/20 transition-colors duration-200 h-24">
                    <td className="px-6 py-4 text-sm font-bold text-gray-300 bg-gray-700/20 border-r border-gray-700/30">
                      {slot.time}
                    </td>
                    {days.map((day) => {
                      const item = slot[day as keyof TimeSlot] as ClassInfo | MealInfo | undefined;
                      return (
                        <td key={day} className="px-4 py-4 text-center border-r border-gray-700/20 last:border-r-0">
                          {item ? (
                            <div className="space-y-2">
                              {'subject' in item ? (
                                // Class info
                                <>
                                  <div className="inline-block px-3 py-1 rounded-lg text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30">
                                    {item.subject}
                                  </div>
                                  <div className="text-xs text-gray-400 space-y-1">
                                    <div className="flex items-center justify-center space-x-1">
                                      <Icon icon="solar:user-speak-bold-duotone" className="w-3 h-3" />
                                      <span className="truncate text-xs">{item.faculty}</span>
                                    </div>
                                    <div className="flex items-center justify-center space-x-1">
                                      <Icon icon="solar:map-point-bold-duotone" className="w-3 h-3" />
                                      <span className="text-xs">Room {item.room}</span>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                // Meal info
                                <div className={`inline-block px-3 py-1 rounded-lg text-xs font-semibold ${getMealTypeColor(item.meal)}`}>
                                  {item.meal}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-gray-600 text-sm">—</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;