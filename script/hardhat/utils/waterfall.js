const waterfall = (tasks) => {
    console.log(tasks)
    return tasks.reduce((p, fn) => p.then(fn), Promise.resolve())
}

module.exports = {
    waterfall,
}
