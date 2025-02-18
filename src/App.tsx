import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Code, Layout, Link, List, Moon, Sun, FolderOpen, ChevronUp, ChevronDown, Save, GripVertical } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MDEditor from '@uiw/react-md-editor';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TimeBlock {
  time: string;
  suggested: boolean;
}

interface TimeEntry {
  completed: boolean;
  startTime?: string;
  endTime?: string;
  title: string;
  link: string;
  subTasks: string[];
  date: string;
  isEditing?: boolean;
  rawContent?: string;
}

function App() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [showCode, setShowCode] = useState(false);
  const [view, setView] = useState('timeline');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEntryIndex, setSelectedEntryIndex] = useState<number | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode !== null) {
      return savedMode === 'true';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [layout, setLayout] = useState<'split' | 'full'>('split');
  const timelineRef = useRef<HTMLDivElement>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.body.style.backgroundColor = isDarkMode ? '#111827' : '#f3f4f6';
    localStorage.setItem('darkMode', isDarkMode.toString());
  }, [isDarkMode]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem('darkMode') === null) {
        setIsDarkMode(e.matches);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [entries]);

  const generateTimeBlocks = () => {
    const blocks: TimeBlock[] = [];
    for (let hour = 8; hour < 17; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        blocks.push({
          time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
          suggested: false
        });
      }
    }
    return blocks;
  };

  const timeBlocks = generateTimeBlocks();

  const parseTimeEntry = (line: string, date: string) => {
    const regex = /- \[([ x])\] (?:(\d{2}:\d{2}) - (\d{2}:\d{2}) )?(?:####\s*)?(?:\[(.*?)\]\((.*?)\)|(.*))/;
    const match = line.match(regex);

    if (match) {
      return {
        completed: match[1] === 'x',
        startTime: match[2] || undefined,
        endTime: match[3] || undefined,
        title: match[4] || match[6] || '',
        link: match[5] || '',
        subTasks: [],
        date,
        rawContent: line,
      };
    }
    return null;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);

    const markdownFiles = files.filter(file => {
      const pattern = /^\d{4}-\d{2}-\d{2}-.+\.md$/;
      return pattern.test(file.name);
    });

    markdownFiles.sort((a, b) => {
      const dateA = a.name.split('-').slice(0, 3).join('-');
      const dateB = b.name.split('-').slice(0, 3).join('-');
      return dateB.localeCompare(dateA);
    });

    const allEntries: TimeEntry[] = [];
    for (const file of markdownFiles) {
      const content = await file.text();
      const lines = content.split('\n');
      const parsedEntries: TimeEntry[] = [];
      let currentEntry: TimeEntry | null = null;

      const date = file.name.split('-').slice(0, 3).join('-');

      lines.forEach(line => {
        if (line.trim().startsWith('- [')) {
          if (currentEntry) {
            parsedEntries.push(currentEntry);
          }
          currentEntry = parseTimeEntry(line, date);
        } else if (currentEntry && line.trim().startsWith('-')) {
          currentEntry.subTasks.push(line.trim().substring(2));
        }
      });

      if (currentEntry) {
        parsedEntries.push(currentEntry);
      }

      allEntries.push(...parsedEntries);
    }

    setEntries(allEntries);
    if (allEntries.length > 0) {
      setSelectedDate(allEntries[0].date);
    }
  };

  const handleSaveChanges = async () => {
    const entriesByDate = entries.reduce((acc, entry) => {
      if (!acc[entry.date]) {
        acc[entry.date] = [];
      }
      acc[entry.date].push(entry);
      return acc;
    }, {} as Record<string, TimeEntry[]>);

    for (const [date, dateEntries] of Object.entries(entriesByDate)) {
      const content = dateEntries.map(entry => {
        const checkbox = entry.completed ? '[x]' : '[ ]';
        const titlePart = entry.link
          ? `[${entry.title}](${entry.link})`
          : entry.title;

        let timePart = '';
        if (entry.startTime && entry.endTime) {
          timePart = `${entry.startTime} - ${entry.endTime} `;
        }

        let entryContent = `- ${checkbox} ${timePart}${titlePart}\n`;
        entry.subTasks.forEach(task => {
          entryContent += `  - ${task}\n`;
        });
        return entryContent;
      }).join('\n');

      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${date}-${new Date(date).toLocaleString('en-us', { weekday: 'long' })}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    setHasUnsavedChanges(false);
  };

  const scrollTimeline = (direction: 'up' | 'down') => {
    if (timelineRef.current) {
      const scrollAmount = 300;
      const newScrollTop = timelineRef.current.scrollTop + (direction === 'up' ? -scrollAmount : scrollAmount);
      timelineRef.current.scrollTo({
        top: newScrollTop,
        behavior: 'smooth'
      });
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

    return `${days[date.getDay()]}, ${date.getDate()}. ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const handleEntryEdit = (index: number, field: keyof TimeEntry, value: any) => {
    setEntries(prev => {
      const newEntries = [...prev];
      newEntries[index] = { ...newEntries[index], [field]: value };
      return newEntries;
    });
    setHasUnsavedChanges(true);
  };

  const handleEntryClick = (date: string, index: number) => {
    setSelectedDate(date);
    setSelectedEntryIndex(index);
  };

  const getMarkdownForDate = (date: string) => {
    const dateEntries = entries.filter(entry => entry.date === date);
    return dateEntries.map(entry => {
      const checkbox = entry.completed ? '[x]' : '[ ]';
      const titlePart = entry.link
        ? `[${entry.title}](${entry.link})`
        : entry.title;

      let entryContent = `- ${checkbox} ${entry.startTime} - ${entry.endTime} ${titlePart}\n`;
      entry.subTasks.forEach(task => {
        entryContent += `  - ${task}\n`;
      });
      return entryContent;
    }).join('\n');
  };

  const SortableTimelineEntry = ({ entry, index }: { entry: TimeEntry; index: number }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: `${entry.date}|${entry.startTime}` });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 1 : 0,
    };

    return (
      <div ref={setNodeRef} style={style} className="flex gap-4 group relative">
        <div className="flex flex-col items-center relative">
          <div {...attributes} {...listeners} className="absolute -left-4 top-1 cursor-grab active:cursor-grabbing p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110">
            <GripVertical className="h-4 w-4 text-gray-400" />
          </div>
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 w-16">
            {entry.startTime}
          </div>
          <div className="w-px h-full bg-gray-200 dark:bg-gray-700 group-last:hidden absolute top-6 left-8 bottom-0" />
        </div>
        <div className="flex-1 pb-8">
          <div
            className={`bg-white dark:bg-gray-800 rounded-lg border p-4 shadow-sm transition-all duration-200 hover:shadow-md ${entry.completed ? 'border-green-500 dark:border-green-600' : ''
              } ${selectedDate === entry.date && selectedEntryIndex === index ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => handleEntryClick(entry.date, index)}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={entry.completed}
                onChange={(e) => {
                  e.stopPropagation();
                  handleEntryEdit(index, 'completed', !entry.completed);
                }}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                {entry.isEditing ? (
                  <div className="space-y-2" data-color-mode={isDarkMode ? 'dark' : 'light'}>
                    <div className="flex gap-2">
                      <input
                        type="time"
                        value={entry.startTime || ''}
                        onChange={(e) => handleEntryEdit(index, 'startTime', e.target.value)}
                        className="w-24 px-2 py-1 rounded border focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Startzeit"
                      />
                      <input
                        type="time"
                        value={entry.endTime || ''}
                        onChange={(e) => handleEntryEdit(index, 'endTime', e.target.value)}
                        className="w-24 px-2 py-1 rounded border focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Endzeit"
                      />
                    </div>
                    <input
                      type="text"
                      value={entry.title}
                      onChange={(e) => handleEntryEdit(index, 'title', e.target.value)}
                      className="w-full px-2 py-1 rounded border focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                      onClick={(e) => e.stopPropagation()}
                    />
                    {entry.link && (
                      <input
                        type="text"
                        value={entry.link}
                        onChange={(e) => handleEntryEdit(index, 'link', e.target.value)}
                        className="w-full px-2 py-1 rounded border focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <MDEditor
                      value={entry.subTasks.join('\n')}
                      onChange={(value) => handleEntryEdit(index, 'subTasks', (value || '').split('\n'))}
                      preview="edit"
                      height={150}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                ) : (
                  <>
                    {entry.link ? (
                      <a
                        href={entry.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-600 flex items-center gap-1 font-medium"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.title}</ReactMarkdown>
                        <Link className="h-4 w-4" />
                      </a>
                    ) : (
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.title}</ReactMarkdown>
                      </span>
                    )}
                    {entry.subTasks.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {entry.subTasks.map((task, taskIndex) => (
                          <li key={taskIndex} className="text-gray-600 dark:text-gray-400 text-sm flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500"></span>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{task}</ReactMarkdown>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  {entry.endTime}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEntryEdit(index, 'isEditing', !entry.isEditing);
                  }}
                  className="text-blue-500 hover:text-blue-600"
                >
                  {entry.isEditing ? 'Save' : 'Edit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const WeekView = () => {
    const entriesByDate = entries.reduce((acc, entry) => {
      if (!acc[entry.date]) {
        acc[entry.date] = [];
      }
      acc[entry.date].push(entry);
      return acc;
    }, {} as Record<string, TimeEntry[]>);

    const dates = Object.keys(entriesByDate).sort();

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {dates.map(date => (
          <div key={date} className="bg-white dark:bg-gray-800 rounded-lg border shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
              {formatDate(date)}
            </h2>
            <div className="space-y-4">
              {entriesByDate[date].map((entry, index) => (
                <div
                  key={index}
                  className={`border-l-4 border-blue-500 pl-3 py-2 cursor-pointer transition-all duration-200 ${selectedDate === date && selectedEntryIndex === index ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  onClick={() => handleEntryClick(date, index)}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={entry.completed}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleEntryEdit(index, 'completed', !entry.completed);
                      }}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {entry.startTime && entry.endTime ? `${entry.startTime} - ${entry.endTime}` : 'Keine Zeit'}
                      </div>
                      {entry.link ? (
                        <a
                          href={entry.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-600 flex items-center gap-1 mt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.title}</ReactMarkdown>
                          <Link className="h-4 w-4" />
                        </a>
                      ) : (
                        <div className="text-gray-900 dark:text-gray-100 mt-1">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.title}</ReactMarkdown>
                        </div>
                      )}
                      {entry.subTasks.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {entry.subTasks.map((task, taskIndex) => (
                            <li key={taskIndex} className="text-gray-600 dark:text-gray-400 text-sm flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500"></span>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{task}</ReactMarkdown>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const activeId = active.id.toString();
      const overId = over.id.toString();
      const [activeDate] = activeId.split('|');
      const [overDate] = overId.split('|');

      if (activeDate === overDate) {
        setEntries((items) => {
          const oldIndex = items.findIndex(item =>
            `${item.date}|${item.startTime}` === activeId
          );
          const newIndex = items.findIndex(item =>
            `${item.date}|${item.startTime}` === overId
          );

          if (oldIndex !== -1 && newIndex !== -1) {
            const result = arrayMove(items, oldIndex, newIndex);
            setHasUnsavedChanges(true);
            return result;
          }
          return items;
        });
      }
    }
  };

  const ListView = () => (
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <div
          key={index}
          className={`bg-white dark:bg-gray-800 rounded-lg border p-3 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer ${selectedDate === entry.date && selectedEntryIndex === index ? 'ring-2 ring-blue-500' : ''
            }`}
          onClick={() => handleEntryClick(entry.date, index)}
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={entry.completed}
              onChange={(e) => {
                e.stopPropagation();
                handleEntryEdit(index, 'completed', !entry.completed);
              }}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-24">
              {entry.startTime && entry.endTime ? `${entry.startTime} - ${entry.endTime}` : 'Keine Zeit'}
            </span>
            {entry.link ? (
              <a
                href={entry.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600 flex items-center gap-1 font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.title}</ReactMarkdown>
                <Link className="h-4 w-4" />
              </a>
            ) : (
              <span className="font-medium text-gray-900 dark:text-gray-100">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.title}</ReactMarkdown>
              </span>
            )}
          </div>
          {entry.subTasks.length > 0 && (
            <div className="ml-7 pl-24 mt-2">
              <ul className="space-y-1">
                {entry.subTasks.map((task, idx) => (
                  <li key={idx} className="text-gray-600 dark:text-gray-400 text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500"></span>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{task}</ReactMarkdown>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const groupedEntries = entries.reduce((groups, entry) => {
    if (!groups[entry.date]) {
      groups[entry.date] = [];
    }
    groups[entry.date].push(entry);
    return groups;
  }, {} as Record<string, TimeEntry[]>);

  const sortedDates = Object.keys(groupedEntries).sort((a, b) => b.localeCompare(a));

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      <div className="dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
        <div className="h-screen flex">
          <div className={`${layout === 'split' ? 'flex-1' : 'w-full'} p-6 ${showCode ? 'border-r' : ''}`}>
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setView(prev => {
                    const views = ['timeline', 'week', 'list'];
                    const currentIndex = views.indexOf(prev);
                    return views[(currentIndex + 1) % views.length];
                  })}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                >
                  {view === 'timeline' ? <Calendar className="h-4 w-4" /> :
                    view === 'week' ? <Layout className="h-4 w-4" /> :
                      view === 'list' ? <List className="h-4 w-4" /> :
                        <Code className="h-4 w-4" />}
                  <span className="text-sm font-medium capitalize">{view} Ansicht</span>
                </button>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer shadow-sm">
                  <FolderOpen className="h-4 w-4" />
                  <span className="text-sm font-medium">Ordner öffnen</span>
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept=".md"
                    onChange={handleFileSelect}
                    // @ts-ignore
                    webkitdirectory=""
                    // @ts-ignore
                    directory=""
                  />
                </label>
                {selectedFiles.length > 0 && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedFiles.length} Dateien geladen
                  </span>
                )}
                {hasUnsavedChanges && (
                  <button
                    onClick={handleSaveChanges}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors shadow-sm"
                  >
                    <Save className="h-4 w-4" />
                    <span className="text-sm font-medium">Änderungen speichern</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLayout(prev => prev === 'split' ? 'full' : 'split')}
                  className="p-2 rounded-lg border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                >
                  <Layout className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setShowCode(!showCode)}
                  className="p-2 rounded-lg border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                >
                  <Code className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className="p-2 rounded-lg border bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                >
                  {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="relative h-[calc(100vh-7rem)]">
              <div
                ref={timelineRef}
                className="h-full overflow-y-auto pr-4 -mr-4 pb-16"
              >
                {view === 'timeline' && (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="space-y-8">
                      {sortedDates.map(date => (
                        <div key={date} className="space-y-2">
                          <h2 className="text-lg font-semibold sticky top-0 bg-gray-100 dark:bg-gray-900 py-2 z-10 drop-shadow-sm">
                            {formatDate(date)}
                          </h2>
                          <SortableContext
                            items={groupedEntries[date].map(entry => `${entry.date}|${entry.startTime}`)}
                            strategy={verticalListSortingStrategy}
                          >
                            {groupedEntries[date].map((entry, index) => (
                              <SortableTimelineEntry
                                key={`${entry.date}|${entry.startTime}`}
                                entry={entry}
                                index={index}
                              />
                            ))}
                          </SortableContext>
                        </div>
                      ))}
                    </div>
                  </DndContext>
                )}
                {view === 'week' && <WeekView />}
                {view === 'list' && <ListView />}
                {view === 'edit' && <EditView setEntries={setEntries} selectedDate={selectedDate} />}
              </div>

              {/* Touch Navigation Buttons */}
              <div className="fixed bottom-4 right-4 flex flex-col gap-2">
                <button
                  onClick={() => scrollTimeline('up')}
                  className="p-3 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl transition-shadow"
                >
                  <ChevronUp className="h-6 w-6" />
                </button>
                <button
                  onClick={() => scrollTimeline('down')}
                  className="p-3 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl transition-shadow"
                >
                  <ChevronDown className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>

          {showCode && (
            <div className={`${layout === 'split' ? 'w-1/2' : 'w-1/3'} p-6 border-l bg-gray-50 dark:bg-gray-900`}>
              <div className="bg-white dark:bg-gray-800 rounded-lg border shadow-sm p-4">
                <h2 className="text-lg font-semibold mb-4 dark:text-white">Markdown Code</h2>
                <div className="w-full h-[calc(100vh-12rem)] p-4 border rounded-lg font-mono text-sm bg-white dark:bg-gray-800 dark:text-gray-100 overflow-auto">
                  {selectedDate ? (
                    <pre className="whitespace-pre-wrap">{getMarkdownForDate(selectedDate)}</pre>
                  ) : (
                    <div className="text-gray-400 dark:text-gray-600">
                      Wählen Sie einen Eintrag aus, um den Markdown-Code anzuzeigen
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const EditView = ({ setEntries, selectedDate }: { setEntries: React.Dispatch<React.SetStateAction<TimeEntry[]>>; selectedDate: string | null }) => {
  const [newEntry, setNewEntry] = useState<Omit<TimeEntry, 'date' | 'subTasks'>>({
    completed: false,
    startTime: undefined,
    endTime: undefined,
    title: '',
    link: '',
  });

  const handleCreateEntry = () => {
    setEntries(prev => [...prev, { ...newEntry, date: selectedDate || new Date().toISOString().slice(0, 10), subTasks: [] }]);
    setNewEntry({ completed: false, startTime: undefined, endTime: undefined, title: '', link: '' });
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">Edit View</h2>
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Titel"
          value={newEntry.title}
          onChange={e => setNewEntry({ ...newEntry, title: e.target.value })}
          className="w-full px-2 py-1 rounded border focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
        />
        <input
          type="text"
          placeholder="Link"
          value={newEntry.link}
          onChange={e => setNewEntry({ ...newEntry, link: e.target.value })}
          className="w-full px-2 py-1 rounded border focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
        />
        <div className="flex gap-2">
          <input
            type="time"
            placeholder="Startzeit"
            value={newEntry.startTime || ''}
            onChange={e => setNewEntry({ ...newEntry, startTime: e.target.value })}
            className="w-24 px-2 py-1 rounded border focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          />
          <input
            type="time"
            placeholder="Endzeit"
            value={newEntry.endTime || ''}
            onChange={e => setNewEntry({ ...newEntry, endTime: e.target.value })}
            className="w-24 px-2 py-1 rounded border focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          />
        </div>
        <button
          onClick={handleCreateEntry}
          className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors shadow-sm"
        >
          Eintrag erstellen
        </button>
      </div>
    </div>
  );
};

export default App;
