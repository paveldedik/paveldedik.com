Title: Hello, World!
Date: 2015-08-15 14:58:48
Tags: writing, science, mathematics, programming

You may be wondering what this blog is all about. Though the content is not written yet, I have the feeling that it's going to be mostly about mathematics and programming. Perhaps, I will even write some articles on physics at some point. Not that I know anything about physics.

## Code Examples

What exactly is the purpose of such examples? I guess I just wanted to demonstrate the power of the awesome [pygments](http://pygments.org/) syntax highlighter. The code bellow represents just some random algorithm I've written in the past. I'm not really sure what it does, though.

    :::python
    def kmp(t, w):
        """Implementation of the Knuth-Morris-Pratt algorithm.

        :param t: Text to be searched.
        :param w: The word sought.
        """
        r = prefix(w)  # the reader has to imagine the implementation
        q = 0
        for i in range(len(t)):
            while q > 0 and w[q] != t[i]:
                q = r[q-1]
            if w[q] == t[i]:
                q += 1
            if q == len(w):
                yield i - len(w) + 1
                q = r[q-1]

Looks good, right? I might as well check one of the gazillions others programming languages. But which one? There are so many. Ok, let's try Rust.

    :::rust
    fn fib(n: i32) -> i32 {
        if n <= 2 {
            return 1
        } else {
            return fib(n-2) + fib(n-1)
        }
    }

I know what you are thinking, it's not exactly the fastest implementation of the Fibonacci sequence. Anyway, what about Haskell?

    :::haskell
    quicksort [] = []
    quicksort (p:xs) = (quicksort lesser) ++ [p] ++ (quicksort greater)
        where
            lesser = filter (< p) xs
            greater = filter (>= p) xs

Delightful!

## Math Examples

You have seen some pretty neat syntax-highlighted code examples, but is it possible to use mathematical equations so that it's both easy for me to write and readable for you at the same time? Let's try it out: $$P(m) = \frac{1}{1 + e^{-m}}$$

Nice! You might not realize it, but I can write mathematical formulas like this: `$P(m) = \frac{1}{1 + e^{-m}}$` (it is LaTeX syntax, in case you don't know). The beautiful typography is the hard work of the [MathJax](https://www.mathjax.org/) plugin, which is a JavaScript display engine for mathematics that works in all browsers™.
