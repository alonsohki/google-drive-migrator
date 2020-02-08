module.exports.throttleAsync = function(func, wait) {
    let queue = [];
    let last = 0;
    let timeout;

    let execute;
    execute = function() {
        const now = new Date().getTime();
        let diff = now - last;

        if (diff >= wait) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            last = now;
            diff = 0;

            const current = queue[0];
            queue = queue.slice(1);

            const args = current.args;
            const promise = current.promise;
            const context = current.context;
            try {
                func.apply(context, args).then(promise.resolve).catch(promise.reject);
            }
            catch (err) {
                promise.reject(err);
            }
        }

        if (!timeout && queue.length > 0) {
            timeout = setTimeout(execute, wait - diff);
        }
    }

    return async function() {
        const context = this;
        return new Promise((resolve, reject) => {
            const obj = {
                args: arguments,
                promise: {
                    resolve: resolve,
                    reject: reject
                },
                context: context
            };
            queue.push(obj);
            execute();
        });
    }
}
