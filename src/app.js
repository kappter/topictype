const { useState, useEffect, useRef } = React;

const TopicTyper = () => {
    const [mode, setMode] = useState('dashboard');
    const [vocabSets, setVocabSets] = useState({});
    const [currentSet, setCurrentSet] = useState(null);
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    const [progress, setProgress] = useState(JSON.parse(localStorage.getItem('progress')) || {});
    const [answers, setAnswers] = useState([]);

    useEffect(() => {
        document.body.className = `bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen flex flex-col ${theme}`;
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        const availableSets = ['vocab.csv'];
        const loadSets = async () => {
            const sets = {};
            for (const set of availableSets) {
                try {
                    const response = await fetch(`/vocab-sets/${set}`);
                    if (!response.ok) throw new Error(`Failed to fetch ${set}`);
                    const csvData = await response.text();
                    const parsedData = Papa.parse(csvData, { header: true, skipEmptyLines: true }).data;
                    sets[set] = parsedData.map(item => ({
                        term: item.term?.trim() || '',
                        definition: item.definition?.trim() || '',
                        strand: item.strand?.trim() || 'N/A',
                        preferred: item.preferred === 'true',
                        caseSensitive: item.caseSensitive === 'true',
                        codingConvention: item.codingConvention || 'none'
                    })).filter(item => item.term && item.definition);
                } catch (error) {
                    console.error(`Error loading ${set}:`, error);
                }
            }
            setVocabSets(sets);
        };
        loadSets();
    }, []);

    const TypingMode = () => {
        const [words, setWords] = useState([]);
        const [currentInput, setCurrentInput] = useState('');
        const [score, setScore] = useState(0);
        const [wave, setWave] = useState(1);
        const [misses, setMisses] = useState(0);
        const [wordsTyped, setWordsTyped] = useState(0);
        const [waveTime, setWaveTime] = useState(30);
        const [gameOver, setGameOver] = useState(false);
        const [difficulty, setDifficulty] = useState('easy');
        const [totalTime, setTotalTime] = useState(0);
        const [gameStartTime, setGameStartTime] = useState(0);
        const [correctKeystrokes, setCorrectKeystrokes] = useState(0);
        const [totalKeystrokes, setTotalKeystrokes] = useState(0);
        const canvasRef = useRef(null);

        useEffect(() => {
            if (!canvasRef.current || !currentSet) return;
            const ctx = canvasRef.current.getContext('2d');
            canvasRef.current.width = 600;
            canvasRef.current.height = window.innerWidth <= 1024 ? 300 : 400;

            const getRandomTerm = () => {
                const terms = currentSet.data.sort((a, b) => (b.preferred ? 1 : 0) - (a.preferred ? 1 : 0) || Math.random() - 0.5);
                return terms[Math.floor(Math.random() * terms.length)];
            };

            const addWord = () => {
                if (gameOver) return;
                const termObj = getRandomTerm();
                ctx.font = '20px Arial';
                const wordWidth = ctx.measureText(termObj.term).width;
                const x = Math.random() * (canvasRef.current.width - wordWidth);
                setWords(w => [...w, { term: termObj.term, definition: termObj.definition, x, y: 0, speed: 0.3, fontSize: 20 }]);
            };

            const drawWord = (word) => {
                ctx.font = `${word.fontSize}px Arial`;
                const displayText = difficulty === 'easy' ? word.term[0] + '_ '.repeat(word.term.length - 1) : '_ '.repeat(word.term.length);
                ctx.fillStyle = 'black';
                ctx.fillText(displayText, word.x, word.y);
                ctx.fillStyle = 'blue';
                const defText = word.definition.substring(0, 50) + (word.definition.length > 50 ? '...' : '');
                ctx.fillText(defText, word.x, word.y - 20);
                if (difficulty === 'medium' && word.y < 50) {
                    ctx.fillStyle = 'gray';
                    ctx.fillText(word.term, word.x, word.y);
                }
                const matchCheck = difficulty === 'hard' ? currentInput : currentInput.toLowerCase();
                const termCheck = difficulty === 'hard' ? word.term : word.term.toLowerCase();
                let matchedLength = matchCheck.startsWith(termCheck.slice(0, currentInput.length)) ? currentInput.length : 0;
                for (let i = 0; i < matchedLength; i++) {
                    ctx.fillStyle = 'red';
                    ctx.fillText(word.term[i], word.x + i * ctx.measureText('_ ').width, word.y);
                }
            };

            const gameLoop = (time) => {
                if (gameOver) return;
                setTotalTime((time - gameStartTime) / 1000);
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                setWaveTime(t => {
                    const newTime = t - 1 / 60;
                    if (newTime <= 0) {
                        setWave(w => w + 1);
                        setWaveTime(30);
                        setWords([]);
                    }
                    return Math.max(0, newTime);
                });
                setWords(w => w.map(word => ({
                    ...word,
                    y: word.y + word.speed,
                    fontSize: 20 + (word.y / canvasRef.current.height) * 4
                })).filter(word => {
                    if (word.y > canvasRef.current.height) {
                        setMisses(m => {
                            const newMisses = m + 1;
                            if (newMisses >= 5) {
                                setGameOver(true);
                                updateProgress(word.term, false);
                            }
                            return newMisses;
                        });
                        setCurrentInput('');
                        return false;
                    }
                    return true;
                }));
                words.forEach(drawWord);
                requestAnimationFrame(gameLoop);
            };

            const startGame = () => {
                setGameStartTime(performance.now());
                addWord();
                setInterval(addWord, 3000);
                requestAnimationFrame(gameLoop);
            };

            startGame();

            const handleKeyDown = (e) => {
                if (gameOver) return;
                if (e.key === 'Backspace') {
                    setTotalKeystrokes(t => t + 1);
                    setCurrentInput(i => i.slice(0, -1));
                } else if (/^[a-z0-9\-']$/.test(e.key.toLowerCase())) {
                    setTotalKeystrokes(t => t + 1);
                    const newInput = currentInput + e.key;
                    setCurrentInput(newInput);
                    const matchCheck = difficulty === 'hard' ? newInput : newInput.toLowerCase();
                    const activeWord = words.find(w => (difficulty === 'hard' ? w.term : w.term.toLowerCase()).startsWith(matchCheck));
                    if (activeWord) {
                        setCorrectKeystrokes(c => c + 1);
                        if (matchCheck === (difficulty === 'hard' ? activeWord.term : activeWord.term.toLowerCase())) {
                            if (difficulty === 'coding' && activeWord.codingConvention !== 'none') {
                                const regex = activeWord.codingConvention === 'camelCase' ? /^[a-z]+([A-Z][a-z]*)*$/ : /^[a-z]+(_[a-z]+)*$/;
                                if (!regex.test(newInput)) return;
                            }
                            setWords(w => w.filter(w => w !== activeWord));
                            setScore(s => s + activeWord.term.length * 10);
                            setWordsTyped(w => w + 1);
                            setCurrentInput('');
                            updateProgress(activeWord.term, true, performance.now() - gameStartTime);
                        }
                    } else {
                        setCurrentInput('');
                    }
                }
            };

            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }, [gameOver, waveTime, misses, currentInput, difficulty, words]);

        const updateProgress = (term, correct, time) => {
            setProgress(p => {
                const newProgress = { ...p };
                if (!newProgress[term]) newProgress[term] = { quiz: {}, typing: { attempts: 0, correct: 0, wpm: 0 } };
                newProgress[term].typing.attempts += 1;
                if (correct) {
                    newProgress[term].typing.correct += 1;
                    newProgress[term].typing.wpm = time > 0 ? (wordsTyped / (time / 1000 / 60)).toFixed(2) : 0;
                }
                localStorage.setItem('progress', JSON.stringify(newProgress));
                return newProgress;
            });
        };

        const downloadCertificate = () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(24);
            doc.text('TopicTyper Certificate', 105, 20, { align: 'center' });
            doc.setFontSize(18);
            doc.text(currentSet ? currentSet.name.replace('.csv', '') : 'Vocabulary', 105, 35, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(12);
            doc.text('Typing Score:', 80, 100);
            doc.text(`${score}`, 130, 100);
            doc.text('Wave Reached:', 80, 110);
            doc.text(`${wave}`, 130, 110);
            doc.text('Words Typed:', 80, 120);
            doc.text(`${wordsTyped}`, 130, 120);
            doc.text('Typing Speed:', 80, 130);
            doc.text(`${totalTime > 0 ? (wordsTyped / (totalTime / 60)).toFixed(2) : 0} WPM`, 130, 130);
            doc.text('Accuracy:', 80, 140);
            doc.text(`${totalKeystrokes > 0 ? (correctKeystrokes / totalKeystrokes * 100).toFixed(2) : 100}%`, 130, 140);
            doc.text(`Issued on ${new Date().toLocaleDateString()}`, 105, 160, { align: 'center' });
            doc.save('TopicTyper_Typing_Certificate.pdf');
        };

        return (
            <div className="container mx-auto p-4">
                <div className="flex justify-between mb-4 text-sm">
                    <div>
                        <span>Score: {score}</span> | <span>Wave: {wave}</span> | <span>Time: {Math.floor(waveTime)}s</span> | <span>Misses: {misses}</span> | <span>WPM: {totalTime > 0 ? (wordsTyped / (totalTime / 60)).toFixed(2) : 0}</span>
                    </div>
                    <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="p-2 bg-gray-200 dark:bg-gray-700 rounded text-sm">
                        <option value="easy">Easy (First Letter)</option>
                        <option value="medium">Medium (Flash Term)</option>
                        <option value="hard">Hard (Case-Sensitive)</option>
                        <option value="coding">Coding Conventions</option>
                    </select>
                </div>
                <canvas ref={canvasRef} className="border-2 border-gray-800 dark:border-gray-200 bg-white"></canvas>
                {gameOver && (
                    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg text-center">
                            <h2 className="text-2xl mb-4">Game Over</h2>
                            <p>Score: {score}</p>
                            <p>Words Typed: {wordsTyped}</p>
                            <p>WPM: {totalTime > 0 ? (wordsTyped / (totalTime / 60)).toFixed(2) : 0}</p>
                            <button onClick={downloadCertificate} className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">Download Certificate</button>
                            <button onClick={() => setMode('dashboard')} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Back to Dashboard</button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const QuizMode = () => {
        const [questions, setQuestions] = useState([]);
        const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
        const [quizStartTime, setQuizStartTime] = useState(null);
        const [totalDuration, setTotalDuration] = useState(0);
        const [questionMode, setQuestionMode] = useState('mixed');

        useEffect(() => {
            if (!currentSet) return;
            const generateQuestions = () => {
                const validData = currentSet.data.filter(item => item.term?.trim() && item.definition?.trim());
                const questions = validData.map(item => {
                    let questionType = questionMode;
                    if (questionMode === 'mixed') {
                        questionType = Math.random() > 0.5 ? 'termToDefinition' : 'definitionToTerm';
                    }
                    let prompt, correctAnswer, incorrectOptions = [], options;
                    if (questionType === 'termToDefinition') {
                        prompt = item.term;
                        correctAnswer = item.definition;
                        while (incorrectOptions.length < 3) {
                            const randomItem = validData[Math.floor(Math.random() * validData.length)];
                            if (randomItem.definition !== item.definition && !incorrectOptions.includes(randomItem.definition)) {
                                incorrectOptions.push(randomItem.definition);
                            }
                        }
                        options = [...incorrectOptions, item.definition].sort(() => Math.random() - 0.5);
                    } else {
                        prompt = item.definition;
                        correctAnswer = item.term;
                        while (incorrectOptions.length < 3) {
                            const randomItem = validData[Math.floor(Math.random() * validData.length)];
                            if (randomItem.term !== item.term && !incorrectOptions.includes(randomItem.term)) {
                                incorrectOptions.push(randomItem.term);
                            }
                        }
                        options = [...incorrectOptions, item.term].sort(() => Math.random() - 0.5);
                    }
                    return { type: questionType, prompt, correct: correctAnswer, options, term: item.term, definition: item.definition, strand: item.strand };
                }).sort((a, b) => (b.preferred ? 1 : 0) - (a.preferred ? 1 : 0) || Math.random() - 0.5);
                setQuestions(questions);
                setQuizStartTime(Date.now());
                setAnswers([]);
            };
            generateQuestions();
        }, [currentSet, questionMode]);

        const selectOption = (index) => {
            const question = questions[currentQuestionIndex];
            const selected = question.options[index];
            const isCorrect = selected === question.correct;
            setAnswers(a => [...a, { term: question.term, selected, correct: question.correct, isCorrect, questionType: question.type }]);
            setProgress(p => {
                const newProgress = { ...p };
                if (!newProgress[question.term]) newProgress[question.term] = { quiz: { attempts: 0, correct: 0 }, typing: {} };
                newProgress[question.term].quiz.attempts += 1;
                if (isCorrect) newProgress[question.term].quiz.correct += 1;
                localStorage.setItem('progress', JSON.stringify(newProgress));
                return newProgress;
            });
            if (currentQuestionIndex < questions.length - 1) {
                setCurrentQuestionIndex(i => i + 1);
            } else {
                setTotalDuration(Math.floor((Date.now() - quizStartTime) / 1000));
                setMode('results');
            }
        };

        return (
            <div className="container mx-auto p-4">
                <div className="flex justify-between mb-4 text-sm">
                    <div>
                        <span>Question {currentQuestionIndex + 1} of {questions.length}</span> | <span>Score: {answers.filter(a => a.isCorrect).length}/{answers.length}</span>
                    </div>
                    <select value={questionMode} onChange={(e) => setQuestionMode(e.target.value)} className="p-2 bg-gray-200 dark:bg-gray-700 rounded text-sm">
                        <option value="termToDefinition">Term to Definition</option>
                        <option value="definitionToTerm">Definition to Term</option>
                        <option value="mixed">Mixed</option>
                    </select>
                </div>
                {questions[currentQuestionIndex] && (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg">
                        <h3 className="text-lg mb-4">
                            Question {currentQuestionIndex + 1}: {questions[currentQuestionIndex].type === 'termToDefinition'
                                ? `What is the definition of "${questions[currentQuestionIndex].prompt}"?`
                                : `What term matches this definition: "${questions[currentQuestionIndex].prompt}"?`}
                        </h3>
                        {questions[currentQuestionIndex].options.map((option, i) => (
                            <div
                                key={i}
                                onClick={() => selectOption(i)}
                                className="p-3 mb-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer"
                            >
                                {option}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const Results = () => {
        const score = answers.filter(a => a.isCorrect).length;
        const percentage = answers.length > 0 ? Math.round((score / answers.length) * 100) : 0;

        const downloadCertificate = () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(24);
            doc.text('TopicTyper Certificate', 105, 20, { align: 'center' });
            doc.setFontSize(18);
            doc.text(currentSet ? currentSet.name.replace('.csv', '') : 'Vocabulary', 105, 35, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(12);
            doc.text('Quiz Score:', 80, 100);
            doc.text(`${score}/${answers.length} (${percentage}%)`, 130, 100);
            doc.text('Total Time:', 80, 110);
            doc.text(`${Math.floor(totalDuration / 60)}:${(totalDuration % 60).toString().padStart(2, '0')}`, 130, 110);
            doc.text(`Issued on ${new Date().toLocaleDateString()}`, 105, 130, { align: 'center' });
            doc.save('TopicTyper_Quiz_Certificate.pdf');
        };

        return (
            <div className="container mx-auto p-4 text-center">
                <h2 className="text-2xl mb-4">Quiz Completed!</h2>
                <p>Score: {score}/{answers.length} ({percentage}%)</p>
                <p>Total Time: {Math.floor(totalDuration / 60)}:{(totalDuration % 60).toString().padStart(2, '0')}</p>
                <button onClick={downloadCertificate} className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">Download Certificate</button>
                <button onClick={() => setMode('dashboard')} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Back to Dashboard</button>
            </div>
        );
    };

    return (
        <div className="container mx-auto p-4">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl sm:text-3xl">TopicTyper</h1>
                <select value={theme} onChange={(e) => setTheme(e.target.value)} className="p-2 bg-gray-200 dark:bg-gray-700 rounded text-sm">
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                </select>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg mb-4">
                <h2 className="text-lg sm:text-xl mb-4">Select Vocabulary Set</h2>
                <select
                    onChange={(e) => {
                        const setName = e.target.value;
                        setCurrentSet(setName ? { name: setName, data: vocabSets[setName] } : null);
                    }}
                    className="w-full p-2 bg-gray-200 dark:bg-gray-700 rounded text-sm"
                >
                    <option value="">Select a set</option>
                    {Object.keys(vocabSets).map(set => (
                        <option key={set} value={set}>{set.replace('.csv', '')}</option>
                    ))}
                </select>
            </div>
            {currentSet && (
                <div className="flex justify-center gap-4">
                    <button
                        onClick={() => setMode('typing')}
                        className="px-4 sm:px-6 py-2 sm:py-3 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm sm:text-base"
                    >
                        Typing Mode
                    </button>
                    <button
                        onClick={() => setMode('quiz')}
                        className="px-4 sm:px-6 py-2 sm:py-3 bg-green-500 text-white rounded hover:bg-green-600 text-sm sm:text-base"
                    >
                        Quiz Mode
                    </button>
                </div>
            )}
            {mode === 'typing' && <TypingMode />}
            {mode === 'quiz' && <QuizMode />}
            {mode === 'results' && <Results />}
        </div>
    );
};

ReactDOM.render(<TopicTyper />, document.getElementById('root'));