function parseContactPdf(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line)

  let result = {
    personnummer: '',
    namn: '',
    adress: '',
    email: '',
    telefon: '',
    föredragna_kontaktsätt: [],
    kurser: [],
    totalt_poäng: '',
  }

  let i = 0
  let tot = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('Personnummer')) {
      result['personnummer'] = lines[i + 1] || ''
      i++
    } else if (line.startsWith('Namn')) {
      result['namn'] = lines[i + 1] || ''
      i++
    } else if (line.startsWith('Adress')) {
      result['adress'] = `${lines[i + 1] || ''}, ${lines[i + 2] || ''}`
      i += 2
    } else if (line.startsWith('E-postadress')) {
      result['email'] = lines[i + 1] || ''
      i++
    } else if (line.startsWith('Telefonnummer')) {
      result['telefon'] = lines[i + 1] || ''
      i++
    } else if (line.startsWith('Föredragna kontaktsätt')) {
      result['föredragna_kontaktsätt'] = []
      while (i + 1 < lines.length && !lines[i + 1].startsWith('Sökta kurser')) {
        let contact = lines[i + 1].trim()
        if (!contact.includes('_')) {
          result['föredragna_kontaktsätt'].push(contact)
        }
        i++
      }
    } else if (line.startsWith('Sökta kurser')) {
      result['kurser'] = []
      i++
      while (i < lines.length) {
        // Match course name and points

        let courseMatch = lines[i].match(/^[0-9]+\.\s(.+),\s([0-9]+)\spoäng/)
        if (courseMatch) {
          let courseName = courseMatch[1]
          let coursePoints = courseMatch[2]

          // Ensure next line contains course details
          let nextLine = lines[i + 1]?.trim()

          if (nextLine && nextLine.match(/^[0-9]+\./)) {
            let details = nextLine.split(',').map((d) => d.trim())
            let Dates = details[0].slice(2).split(' ')
            let startDate = Dates[0]
            let endDate = Dates[2]
            if (details.length >= 5) {
              let courseObj = {
                namn: courseName,
                poäng: coursePoints,
                start: startDate || '',
                slut: endDate || '',
                veckor: details[1] || '',
                skola: details[2] || '',
                studieform: details[3] || '',
                kod: details[4] || '',
              }
              tot += Number(coursePoints)
              result['kurser'].push(courseObj)
              i++ // Move past course details
            } else {
            }
          }
        }

        i++ // Move to the next potential course
      }
    } else if (line.startsWith('Totalt antal sökta poäng')) {
      console.log('Tutti!')
      result['totalt_poäng'] = lines[i + 1]?.replace('poäng', '').trim()
      i++
    }

    i++
  }
  result['totalt_poäng'] = tot
  return result
}

export { parseContactPdf }
