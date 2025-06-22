import React, { useState } from 'react';
import { Icon } from '@iconify/react';

// Import JSON data
import classesData from '../classes.json';
import diningData from '../dining.json';

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
  // Local storage key for remembering last section
  const STORAGE_KEY = 'rs-routine-last-section';

  // Get section from URL hash or localStorage
  const getInitialSection = (): string => {
    // Check URL hash first
    const hash = window.location.hash;
    const urlSection = hash.substring(1); // Remove leading #
    
    if (urlSection && /^\d+$/.test(urlSection)) {
      // If hash has a number, validate it exists in our data
      const normalizedSection = 'S' + urlSection.padStart(2, '0');
      const sectionExists = classesData.sections.some(section => 
        section.toLowerCase() === normalizedSection.toLowerCase()
      );
      
      if (sectionExists) {
        return urlSection;
      } else {
        // Invalid section in hash, clear it
        window.location.hash = '';
        return localStorage.getItem(STORAGE_KEY) || '';
      }
    }
    
    // No hash section, check localStorage
    return localStorage.getItem(STORAGE_KEY) || '';
  };

  const initialSection = getInitialSection();
  const [currentView, setCurrentView] = useState<'input' | 'schedule'>(
    initialSection ? 'schedule' : 'input'
  );
  const [selectedSection, setSelectedSection] = useState(initialSection);
  const [isLoading, setIsLoading] = useState(false);
  const [schedule, setSchedule] = useState<TimeSlot[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Save section to localStorage and update hash
  const saveSection = (section: string) => {
    localStorage.setItem(STORAGE_KEY, section);
    window.location.hash = section ? section : '';
  };

  // Clear section from localStorage and reset hash
  const clearSection = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.hash = '';
  };

  // Helper function to convert time string to minutes for proper sorting
  const timeToMinutes = (timeStr: string): number => {
    const time = timeStr.split('-')[0].trim(); // Get start time
    const [timePart, period] = time.split(/([AP]M)/);
    const [hours, minutes] = timePart.split('.').map(Number);
    
    let totalMinutes = (hours % 12) * 60 + (minutes || 0);
    if (period === 'PM') totalMinutes += 12 * 60;
    
    return totalMinutes;
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

  // Format date for ICS
  const formatICSDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  // Generate ICS content
  const generateICS = (): string => {
    const events = [];
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
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
            eventDescription = `Instructor: ${item.faculty}\\nSection: ${item.section}`;
            eventLocation = `Room ${item.room}`;
          } else {
            // Meal event
            eventTitle = item.meal;
            eventDescription = `Dining time: ${item.timeRange}`;
            eventLocation = 'Tripty';
          }
          
          // Generate a unique UID for each event
          const uid = `${dayIndex}-${slot.time.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}@rs-routine.local`;
          
          // Set end date to September 6th, 2024
          const endDate = new Date('2024-09-06T23:59:59Z');
          
          events.push({
            uid,
            summary: eventTitle,
            description: eventDescription,
            location: eventLocation,
            dtstart: formatICSDate(start),
            dtend: formatICSDate(end),
            rrule: `FREQ=WEEKLY;UNTIL=${formatICSDate(endDate)}`, // Repeat until September 6th, 2024
            timezone
          });
        }
      }
    }
    
    // Build ICS content
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//RS 69 Routine//Schedule Export//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];
    
    events.forEach(event => {
      icsContent.push(
        'BEGIN:VEVENT',
        `UID:${event.uid}`,
        `DTSTART:${event.dtstart}`,
        `DTEND:${event.dtend}`,
        `RRULE:${event.rrule}`,
        `SUMMARY:${event.summary}`,
        `DESCRIPTION:${event.description}`,
        `LOCATION:${event.location}`,
        `DTSTAMP:${formatICSDate(now)}`,
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'END:VEVENT'
      );
    });
    
    icsContent.push('END:VCALENDAR');
    
    return icsContent.join('\r\n');
  };

  // Export schedule as ICS file
  const exportToICS = () => {
    setIsExporting(true);
    
    try {
      const icsContent = generateICS();
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `rs-routine-section-${selectedSection}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      alert('Calendar downloaded successfully! You can now import it into Google Calendar, Outlook, Apple Calendar, or any other calendar app.');
    } catch (error) {
      console.error('Error exporting ICS:', error);
      alert('Failed to download calendar. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

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

  const loadScheduleForSection = (section: string): boolean => {
    // Normalize section input - add 'S' prefix if it's just a number
    let normalizedSection = section.trim();
    if (/^\d+$/.test(normalizedSection)) {
      // If it's just digits, add 'S' prefix
      normalizedSection = 'S' + normalizedSection.padStart(2, '0');
    }
    
    // Find section index
    const sectionIndex = classesData.sections.findIndex(sectionData => 
      sectionData.toLowerCase() === normalizedSection.toLowerCase()
    );
    
    if (sectionIndex === -1) {
      return false;
    }

    // Generate schedule
    const combinedSchedule = getCombinedSchedule(sectionIndex);
    setSchedule(combinedSchedule);
    return true;
  };

  const handleSectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSection.trim()) return;
    
    setIsLoading(true);
    
    const success = loadScheduleForSection(selectedSection);
    
    if (!success) {
      alert('Section not found! Please try a valid section like S01, S02, etc.');
      setIsLoading(false);
      return;
    }

    // Save to localStorage and update URL
    saveSection(selectedSection.trim());
    
    await new Promise(resolve => setTimeout(resolve, 800));
    setIsLoading(false);
    setCurrentView('schedule');
  };

  // Load schedule on initial render if we have a section
  React.useEffect(() => {
    if (initialSection && currentView === 'schedule') {
      const success = loadScheduleForSection(initialSection);
      if (!success) {
        // Invalid section, go to input
        setCurrentView('input');
        setSelectedSection('');
        clearSection();
      } else {
        // Valid section, save it to localStorage if it came from hash
        const hash = window.location.hash;
        const hashSection = hash.substring(1);
        if (hashSection && hashSection === initialSection) {
          saveSection(initialSection);
        }
      }
    }
  }, []);

  // Handle hash change navigation
  React.useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const hashSection = hash.substring(1);
      
      if (hashSection && /^\d+$/.test(hashSection)) {
        // Navigated to a section hash
        const normalizedSection = 'S' + hashSection.padStart(2, '0');
        const sectionExists = classesData.sections.some(section => 
          section.toLowerCase() === normalizedSection.toLowerCase()
        );
        
        if (sectionExists) {
          setSelectedSection(hashSection);
          const success = loadScheduleForSection(hashSection);
          if (success) {
            setCurrentView('schedule');
            localStorage.setItem(STORAGE_KEY, hashSection);
          }
        } else {
          // Invalid section, go to home
          setCurrentView('input');
          setSelectedSection('');
          localStorage.removeItem(STORAGE_KEY);
          window.location.hash = '';
        }
      } else {
        // Navigated to home (no hash)
        setCurrentView('input');
        setSelectedSection('');
        localStorage.removeItem(STORAGE_KEY);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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
      <div className='min-h-[100dvh] bg-pattern relative overflow-hidden'>
        {/* Simplified background */}
        <div className='absolute inset-0 overflow-hidden'>
          <div className='absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-zinc-600/10 to-zinc-600/10 rounded-full blur-3xl'></div>
        </div>

        <div className='absolute inset-0 overflow-hidden'>
          <div className='absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-zinc-600/10 to-zinc-600/10 rounded-full blur-3xl'></div>
        </div>

        <div className='relative z-10 flex items-center justify-center min-h-screen px-6'>
          <div className='max-w-lg w-full'>
            {/* Minimal Header */}
            <div className='text-center mb-8'>
              <div className='flex items-center justify-center space-x-4 mb-4'>
                <div className='inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#a782e0] to-violet-600 rounded-2xl'>
                  <Icon
                    icon='solar:calendar-bold-duotone'
                    className='w-10 h-10 text-white'
                  />
                </div>
                <h1 className='text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent text-left'>
                  RS 69 Routine
                  <p className='text-gray-400 text-sm mt-1 font-normal tracking-wide leading-relaxed text-left'>
                    Track of your schedule easily
                  </p>
                </h1>
              </div>
            </div>

            {/* Clean Input Form */}
            <div className='bg-zinc-800 backdrop-blur-xl rounded-[2.5rem] p-8'>
              <form onSubmit={handleSectionSubmit} className='space-y-6'>
                <div>
                  <label
                    htmlFor='section'
                    className='block text-sm font-medium text-gray-300 mb-3 text-left'
                  >
                    Section Number
                  </label>
                  <div className='relative'>
                    <input
                      type='number'
                      id='section'
                      value={selectedSection}
                      onChange={(e) =>
                        setSelectedSection(e.target.value.toUpperCase())
                      }
                      placeholder='25'
                      className='w-full px-4 py-3 pl-12 text-md bg-zinc-700/50 text-white placeholder-zinc-500 rounded-2xl focus:outline-none focus:bg-zinc-700/70 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-left'
                      disabled={isLoading}
                    />
                    <Icon
                      icon='solar:magnifer-bold-duotone'
                      className='absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400'
                    />
                  </div>
                </div>

                <button
                  type='submit'
                  disabled={!selectedSection.trim() || isLoading}
                  className='w-full bg-gradient-to-r from-[#a782e0] to-violet-600 hover:from-[#a782e0] hover:to-violet-700 disabled:from-zinc-600 disabled:to-zinc-600 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-2xl transition-all duration-300 flex items-center justify-center space-x-2'
                >
                  {isLoading ? (
                    <>
                      <Icon
                        icon='solar:refresh-bold-duotone'
                        className='w-5 h-5 animate-spin'
                      />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <Icon
                        icon='solar:calendar-search-bold-duotone'
                        className='w-5 h-5'
                      />
                      <span>View Schedule</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Features */}
            <div className='mt-6 bg-zinc-800 rounded-[2.5rem] px-6 py-6'>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-0 md:gap-0'>
                <div className='flex items-center justify-center md:justify-start space-x-3 py-3 md:py-0'>
                  <Icon
                    icon='solar:book-bold-duotone'
                    className='w-5 h-5 text-green-400'
                  />
                  <span className='text-sm text-gray-300 font-medium'>
                    Class Schedule
                  </span>
                </div>
                <div className='flex items-center justify-center md:justify-start space-x-3 py-3 md:py-0 relative before:content-[""] before:absolute before:top-0 before:left-1/2 before:-translate-x-1/2 before:w-52 before:h-px before:bg-gray-700/50 md:before:hidden md:border-l md:border-gray-700/50 md:pl-4'>
                  <Icon
                    icon='solar:cup-hot-bold-duotone'
                    className='w-5 h-5 text-amber-400'
                  />
                  <span className='text-sm text-gray-300 font-medium'>
                    Dining Times
                  </span>
                </div>
                <div className='flex items-center justify-center md:justify-start space-x-3 py-3 md:py-0 relative before:content-[""] before:absolute before:top-0 before:left-1/2 before:-translate-x-1/2 before:w-52 before:h-px before:bg-gray-700/50 md:before:hidden md:border-l md:border-gray-700/50 md:pl-4'>
                  <Icon
                    icon='solar:calendar-bold-duotone'
                    className='w-5 h-5 text-blue-400'
                  />
                  <span className='text-sm text-gray-300 font-medium whitespace-nowrap'>
                    Calendar (.ics)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-pattern flex flex-col relative overflow-hidden'>
      {/* Background Elements */}
      <div className='absolute inset-0 overflow-hidden'>
        <div className='absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-zinc-600/10 to-zinc-600/10 rounded-full blur-3xl'></div>
      </div>
      <div className='absolute inset-0 overflow-hidden'>
        <div className='absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-zinc-600/10 to-zinc-600/10 rounded-full blur-3xl'></div>
      </div>

      {/* Header */}
      <div className='bg-zinc-800/50 backdrop-blur-xl sticky top-0 z-10 flex-shrink-0 relative'>
        <div className='container mx-auto px-4 py-4'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center space-x-3 md:space-x-6 flex-1 min-w-0'>
              <button
                onClick={() => {
                  setCurrentView("input");
                  setSelectedSection('');
                  clearSection();
                }}
                className='flex items-center space-x-2 text-zinc-400 hover:text-white transition-colors duration-200 group flex-shrink-0'
              >
                <Icon
                  icon='ion:arrow-back-outline'
                  className='w-5 h-5 md:w-6 md:h-6 group-hover:-translate-x-1 transition-transform duration-200'
                />
                <span className='font-medium hidden sm:inline'>Back</span>
              </button>
              <div className='min-w-0 flex-1'>
                <h1 className='text-lg md:text-2xl font-bold text-white truncate'>
                  Weekly Routine
                </h1>
                <p className='text-xs md:text-sm text-zinc-400 mt-1'>
                  Section:{" "}
                  <span className='text-[#a782e0] font-medium'>
                    {selectedSection}
                  </span>
                </p>
              </div>
            </div>

            {/* ICS Export Button */}
            <button
              onClick={exportToICS}
              disabled={isExporting}
              className='flex items-center space-x-1.5 bg-gradient-to-r border border-[#a782e0] hover:border-zinc-800 hover:from-[#a782e0] hover:to-violet-600 disabled:from-zinc-600 disabled:to-zinc-600 disabled:cursor-not-allowed text-white font-medium px-3 md:px-6 py-2 md:py-3 rounded-2xl flex-shrink-0'
            >
              {isExporting ? (
                <>
                  <Icon
                    icon='solar:refresh-bold-duotone'
                    className='w-4 h-4 md:w-5 md:h-5 animate-spin'
                  />
                  <span className='text-sm md:text-base'>Downloading...</span>
                </>
              ) : (
                <>
                  <Icon
                    icon='mage:calendar-download-fill'
                    className='w-4 h-4 md:w-5 md:h-5'
                  />
                  <span className='text-sm md:text-base'>
                    Download Calendar (.ics)
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Schedule Table - Full Height */}
      <div className='flex-1 overflow-hidden relative'>
        <div className='h-full bg-zinc-800/30 backdrop-blur-xl m-4 rounded-3xl overflow-hidden'>
          <div className='h-full overflow-auto'>
            <table className='w-full h-full'>
              <thead className='bg-zinc-700/50 sticky top-0 z-10'>
                <tr>
                  <th className='px-6 py-4 text-left text-sm font-bold text-zinc-200 w-32'>
                    <div className='flex items-center space-x-2'>
                      <Icon
                        icon='solar:clock-circle-bold-duotone'
                        className='w-4 h-4 text-[#a782e0]'
                      />
                      <span>Time</span>
                    </div>
                  </th>
                  {dayLabels.map((day) => (
                    <th
                      key={day}
                      className='px-4 py-4 text-center text-sm font-bold text-zinc-200'
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y divide-zinc-700/30'>
                {schedule.map((slot, index) => (
                  <tr
                    key={index}
                    className='hover:bg-zinc-700/20 transition-colors duration-200 h-24'
                  >
                    <td className='px-6 py-4 text-sm font-bold text-zinc-300 bg-zinc-700/20 border-r border-zinc-700/30'>
                      {slot.time}
                    </td>
                    {days.map((day) => {
                      const item = slot[day as keyof TimeSlot] as
                        | ClassInfo
                        | MealInfo
                        | undefined;
                      return (
                        <td
                          key={day}
                          className='px-4 py-4 text-center border-r border-zinc-700/20 last:border-r-0'
                        >
                          {item ? (
                            <div className='space-y-2'>
                              {"subject" in item ? (
                                // Class info
                                <>
                                  <div className='inline-block px-3 py-1 rounded-2xl text-xs font-semibold bg-[#a782e0]/20 text-[#a782e0] border border-[#a782e0]/30'>
                                    {item.subject}
                                  </div>
                                  <div className='text-xs text-zinc-400 space-y-1'>
                                    <div className='flex items-center justify-center space-x-1'>
                                      <Icon
                                        icon='solar:user-speak-bold-duotone'
                                        className='w-3 h-3'
                                      />
                                      <span className='truncate text-xs'>
                                        {item.faculty}
                                      </span>
                                    </div>
                                    <div className='flex items-center justify-center space-x-1'>
                                      <Icon
                                        icon='solar:map-point-bold-duotone'
                                        className='w-3 h-3'
                                      />
                                      <span className='text-xs'>
                                        Room {item.room}
                                      </span>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                // Meal info
                                <div
                                  className={`inline-block px-3 py-1 rounded-2xl text-xs font-semibold ${getMealTypeColor(
                                    item.meal
                                  )}`}
                                >
                                  {item.meal}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className='text-zinc-600 text-sm'>—</div>
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